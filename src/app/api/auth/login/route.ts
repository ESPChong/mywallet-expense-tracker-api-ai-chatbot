import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/validations';
import { generateSessionToken, hashSessionToken } from '@/lib/session';
import {
  checkWindowRateLimit,
  resetWindowRateLimit,
  envLimit,
  clientIpFromRequest,
} from '@/lib/rateLimit';
import { materializeUserIncomeSafe } from '@/services/incomeService';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const RATE_WINDOW_MS = 15 * 60 * 1000;

// Lazily computed hash used to equalize response times when the email is unknown
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash() {
  dummyHashPromise ??= bcrypt.hash('timing-equalization-dummy', 12);
  return dummyHashPromise;
}

export async function POST(request: Request) {
  try {
    const result = loginSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { email, password } = result.data;

    // Rate limit BEFORE any user lookup — identical behavior for unknown and
    // known emails (no enumeration via limiter timing). Attackers must pass
    // BOTH the per-email and per-IP buckets.
    const ip = clientIpFromRequest(request);
    const emailCheck = checkWindowRateLimit(
      `login:email:${email}`,
      envLimit('LOGIN_RATE_LIMIT_EMAIL', 10),
      RATE_WINDOW_MS,
    );
    const ipCheck = checkWindowRateLimit(
      `login:ip:${ip}`,
      envLimit('LOGIN_RATE_LIMIT_IP', 30),
      RATE_WINDOW_MS,
    );
    if (!emailCheck.allowed || !ipCheck.allowed) {
      const retryAfter = Math.max(emailCheck.retryAfterSeconds, ipCheck.retryAfterSeconds);
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, password: true },
    });

    const passwordHash = user?.password ?? (await getDummyHash());
    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!user || !isPasswordValid) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: { sessionToken: hashSessionToken(sessionToken), userId: user.id, expiresAt },
    });

    const cookieStore = await cookies();
    cookieStore.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    // Success clears the per-email bucket (typos shouldn't lock you out);
    // the per-IP bucket stays — distributed guessing still hits the cap.
    resetWindowRateLimit(`login:email:${email}`);

    // Materialize due recurring income — POST = legitimate side-effect site
    await materializeUserIncomeSafe(user.id);

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
      message: 'Logged in successfully',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
