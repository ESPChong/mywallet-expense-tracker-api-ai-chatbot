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

/** Single fetch wrapper for every API call in the app. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON body — fall through to generic error below
  }

  if (!res.ok) {
    // Handles both envelope shapes: auth { success, error } and CRUD { error, details? }
    const p = (payload ?? {}) as { error?: string; details?: ApiIssue[] };
    throw new ApiError(res.status, p.error ?? `Request failed (${res.status})`, p.details);
  }

  return payload as T;
}
