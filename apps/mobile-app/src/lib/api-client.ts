import * as SecureStore from 'expo-secure-store';

const API_URL = 'http://192.168.0.110:3000';

export interface ApiIssue {
  code?: string;
  message: string;
  path?: Array<string | number | symbol>;
}

export class ApiError extends Error {
  public readonly status: number;
  public details?: ApiIssue[];

  constructor(status: number, message: string, details?: ApiIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('session_token');
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('session_token', token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync('session_token');
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await getStoredToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    const p = (payload ?? {}) as { error?: string };
    throw new ApiError(res.status, p.error ?? `Request failed (${res.status})`);
  }

  return payload as T;
}