import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/session';
import { cookieStore } from './mocks/next-headers';
import { req, createTestUser, createUserWithSession, authenticate, clearAuth } from './helpers';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { GET as meHandler } from '@/app/api/me/route';

describe('POST /api/auth/register', () => {
  it('creates the user, seeds 9 default categories, hashes the password, opens a session', async () => {
    const res = await registerHandler(
      req('POST', '/api/auth/register', {
        name: 'Alice',
        email: 'alice@EXAMPLE.com',
        password: 'password123',
      }),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.user).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
    expect(body.user.password).toBeUndefined();

    const dbUser = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.password).not.toBe('password123');
    expect(await prisma.category.count({ where: { userId: dbUser!.id } })).toBe(9);

    const token = cookieStore.get('session_token');
    expect(token).toBeTruthy();
    // Stored hashed, not in plaintext
    expect(await prisma.session.findUnique({ where: { sessionToken: token! } })).toBeNull();
    expect(
      await prisma.session.findUnique({ where: { sessionToken: hashSessionToken(token!) } }),
    ).not.toBeNull();
  });

  it('rejects duplicate emails case-insensitively (409)', async () => {
    await createTestUser({ email: 'bob@test.dev' });
    const res = await registerHandler(
      req('POST', '/api/auth/register', {
        name: 'Bob',
        email: 'BOB@test.dev',
        password: 'password123',
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 400 with details for invalid input', async () => {
    const res = await registerHandler(
      req('POST', '/api/auth/register', { name: 'A', email: 'nope', password: '123' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with a case-insensitive email and sets the session cookie', async () => {
    const { user, password } = await createTestUser({ email: 'carol@test.dev' });
    const res = await loginHandler(
      req('POST', '/api/auth/login', { email: 'CAROL@test.dev', password }),
    );
    expect(res.status).toBe(200);
    expect(cookieStore.get('session_token')).toBeTruthy();
    expect((await res.json()).user.id).toBe(user.id);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('returns 401 for a wrong password', async () => {
    await createTestUser({ email: 'dave@test.dev' });
    const res = await loginHandler(
      req('POST', '/api/auth/login', { email: 'dave@test.dev', password: 'wrong-password' }),
    );
    expect(res.status).toBe(401);
    expect(cookieStore.get('session_token')).toBeUndefined();
  });

  it('returns 401 for an unknown email', async () => {
    const res = await loginHandler(
      req('POST', '/api/auth/login', { email: 'ghost@test.dev', password: 'password123' }),
    );
    expect(res.status).toBe(401);
  });

  it('materializes due recurring income on login', async () => {
    const { user, password } = await createTestUser({ email: 'materialize@test.dev' });
    await prisma.income.create({ data: { amount: 50000, dayOfMonth: 1, userId: user.id } });

    const res = await loginHandler(
      req('POST', '/api/auth/login', { email: 'materialize@test.dev', password }),
    );
    expect(res.status).toBe(200);
    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe('POST /api/auth/logout', () => {
  it('deletes the session row and clears the cookie', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const res = await logoutHandler(req('POST', '/api/auth/logout'));
    expect(res.status).toBe(200);
    expect(cookieStore.get('session_token')).toBeUndefined();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('GET /api/me', () => {
  it('returns the current user when authenticated', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const res = await meHandler(req('GET', '/api/me'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: user.id, email: user.email });
    expect(body.user.password).toBeUndefined();
  });

  it('returns 401 without a session cookie', async () => {
    clearAuth();
    expect((await meHandler(req('GET', '/api/me'))).status).toBe(401);
  });
});

describe('POST /api/auth/login rate limiting', () => {
  afterEach(() => {
    delete process.env.LOGIN_RATE_LIMIT_EMAIL;
  });

  it('locks out after repeated failures per email, with Retry-After', async () => {
    process.env.LOGIN_RATE_LIMIT_EMAIL = '3';
    const { user } = await createTestUser({ email: 'ratelimit@test.dev' });

    for (let i = 0; i < 3; i++) {
      const res = await loginHandler(
        req('POST', '/api/auth/login', { email: user.email, password: 'wrong-password-xyz' }),
      );
      expect(res.status).toBe(401);
    }
    const blocked = await loginHandler(
      req('POST', '/api/auth/login', { email: user.email, password: 'wrong-password-xyz' }),
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await blocked.json()).success).toBe(false);
  });

  it('a successful login resets the email bucket', async () => {
    process.env.LOGIN_RATE_LIMIT_EMAIL = '3';
    const { user, password } = await createTestUser({ email: 'resetbucket@test.dev' });

    for (let i = 0; i < 2; i++) {
      await loginHandler(
        req('POST', '/api/auth/login', { email: user.email, password: 'nope-nope' }),
      );
    }
    expect(
      (await loginHandler(req('POST', '/api/auth/login', { email: user.email, password }))).status,
    ).toBe(200);

    // Bucket was reset — three more failures allowed before blocking
    for (let i = 0; i < 3; i++) {
      const res = await loginHandler(
        req('POST', '/api/auth/login', { email: user.email, password: 'nope' }),
      );
      expect(res.status).toBe(401);
    }
    expect(
      (await loginHandler(req('POST', '/api/auth/login', { email: user.email, password: 'nope' })))
        .status,
    ).toBe(429);
  });
});

describe('POST /api/auth/register rate limiting', () => {
  afterEach(() => {
    delete process.env.REGISTER_RATE_LIMIT_IP;
  });

  it('rate limits registrations per IP', async () => {
    process.env.REGISTER_RATE_LIMIT_IP = '2';
    const stamp = Date.now();
    for (let i = 0; i < 2; i++) {
      const res = await registerHandler(
        req('POST', '/api/auth/register', {
          name: `User ${i}`,
          email: `rl${stamp}-${i}@test.dev`,
          password: 'password123',
        }),
      );
      expect(res.status).toBe(201);
    }
    const blocked = await registerHandler(
      req('POST', '/api/auth/register', {
        name: 'User 3',
        email: `rl${stamp}-3@test.dev`,
        password: 'password123',
      }),
    );
    expect(blocked.status).toBe(429);
  });
});
