import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setStoredToken, clearStoredToken } from '../lib/api-client';
import type { User } from '../types/api';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ success: boolean; user: User }>('/api/me'),
    retry: false,
  });
}

export async function login(email: string, password: string) {
  const res = await api<{ success: boolean; user: User; sessionToken: string }>(
    '/api/auth/login',
    { method: 'POST', body: { email, password } },
  );
  await setStoredToken(res.sessionToken);
  return res.user;
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    await clearStoredToken();
  }
}