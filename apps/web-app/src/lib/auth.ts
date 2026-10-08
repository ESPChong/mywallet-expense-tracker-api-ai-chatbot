import { cookies, headers } from 'next/headers';
import { prisma } from './prisma';
import { hashSessionToken } from './session';

export type AuthUser = { id: string; name: string; email: string };

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('session_token')?.value;

  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const token = cookieToken ?? bearerToken;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: hashSessionToken(token) },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

// Usable error type: routes can catch this and map it to a proper status code
export class ApiError extends Error {
  constructor(
    public _status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Authentication required');
  return user;
}
