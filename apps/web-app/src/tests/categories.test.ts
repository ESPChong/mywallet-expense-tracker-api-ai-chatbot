import { describe, it, expect } from 'vitest';
import {
  req,
  createTestUser,
  createUserWithSession,
  authenticate,
  clearAuth,
  seedCategory,
} from './helpers';
import { GET as listCategories, POST as createCategory } from '@/app/api/categories/route';

describe('categories API', () => {
  it('rejects unauthenticated requests', async () => {
    clearAuth();
    expect((await listCategories(req('GET', '/api/categories'))).status).toBe(401);
    expect((await createCategory(req('POST', '/api/categories', { name: 'x' }))).status).toBe(401);
  });

  it('creates a category and lists only the requesting user’s', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    const other = await createTestUser();
    await seedCategory(other.user.id, 'private');

    const created = await createCategory(req('POST', '/api/categories', { name: 'hobbies' }));
    expect(created.status).toBe(201);
    expect((await created.json()).name).toBe('hobbies');

    const list = await listCategories(req('GET', '/api/categories'));
    const names = (await list.json()).data.map((c: { name: string }) => c.name);
    expect(names).toContain('hobbies');
    expect(names).not.toContain('private');
  });

  it('rejects duplicates with 409 and invalid names with 400 + details', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    await seedCategory(user.id, 'food');

    expect((await createCategory(req('POST', '/api/categories', { name: 'food' }))).status).toBe(
      409,
    );

    const invalid = await createCategory(req('POST', '/api/categories', { name: '' }));
    expect(invalid.status).toBe(400);
    const body = await invalid.json();
    expect(body.success).toBe(false);
    expect(Array.isArray(body.details)).toBe(true);
  });
});
