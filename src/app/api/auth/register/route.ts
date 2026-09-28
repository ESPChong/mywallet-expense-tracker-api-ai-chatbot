import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validations';
import { generateSessionToken, hashSessionToken } from '@/lib/session';
import { checkWindowRateLimit, envLimit, clientIpFromRequest } from '@/lib/rateLimit';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { DEFAULT_CATEGORIES } from '@/lib/default-category';

const RATE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const result = registerSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { name, email, password } = result.data;

    // Rate limit registrations per IP (mass account-creation guard)
    const ip = clientIpFromRequest(request);
    const ipCheck = checkWindowRateLimit(
      `register:ip:${ip}`,
      envLimit('REGISTER_RATE_LIMIT_IP', 10),
      RATE_WINDOW_MS,
    );
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many registrations from this network. Please try again later.',
        },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, ipCheck.retryAfterSeconds)) } },
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, password: hashedPassword },
        select: { id: true, name: true, email: true },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((catName) => ({ name: catName, userId: newUser.id })),
      });
      return newUser;
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
    // NOTE: the non-httpOnly `user_data` cookie was removed on purpose.
    // The client should get user info from GET /api/me — it can't go stale
    // and can't be tampered with.

    return NextResponse.json(
      { success: true, user, message: 'User registered successfully' },
      { status: 201 },
    );
  } catch (error) {
    // Concurrent registration race → unique constraint on email
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 },
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
