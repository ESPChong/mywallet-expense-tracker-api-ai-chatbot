import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateSessionToken, hashSessionToken } from '@/lib/session';
import { cookieStore } from './mocks/next-headers';

let counter = 0;
const uniqueEmail = () => `user${++counter}-${Date.now()}@test.dev`;

export async function createTestUser(opts: { email?: string; name?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? 'Test User',
      email: (opts.email ?? uniqueEmail()).toLowerCase(),
      password: await bcrypt.hash('password123', 4), // low rounds: fast tests
    },
  });
  return { user, password: 'password123' };
}

export async function createSession(userId: string) {
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      sessionToken: hashSessionToken(token), // same storage path as the real login
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function createUserWithSession(opts: { email?: string; name?: string } = {}) {
  const { user } = await createTestUser(opts);
  const token = await createSession(user.id);
  return { user, token };
}

export function authenticate(token: string) {
  cookieStore.set('session_token', token);
}

export function clearAuth() {
  cookieStore.delete('session_token');
}

// Handlers only use .json() and .url, so a plain Request is sufficient at runtime
export function req(method: string, path: string, body?: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

export async function seedCategory(userId: string, name = 'groceries') {
  return prisma.category.create({ data: { name, userId } });
}

export async function seedExpense(
  userId: string,
  data: { name?: string; amount?: number; date?: Date; categoryId?: string | null } = {},
) {
  return prisma.expense.create({
    data: {
      name: data.name ?? 'Lunch',
      amount: data.amount ?? 1000,
      date: data.date ?? new Date(),
      categoryId: data.categoryId ?? null,
      userId,
    },
  });
}
