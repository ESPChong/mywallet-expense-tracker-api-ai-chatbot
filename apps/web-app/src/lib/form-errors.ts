import { ApiError } from './api-client';

/** Maps a 400's Zod details into { fieldName: message } for react-hook-form setError. */
export function fieldErrorsFromApi(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {};
  const errors: Record<string, string> = {};
  for (const issue of error.details) {
    const field = issue.path?.[0];
    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
