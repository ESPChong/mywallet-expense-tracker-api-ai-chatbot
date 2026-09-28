import { NextResponse } from 'next/server';

/** Canonical error envelope — every API error in the app returns this shape. */
export function apiError(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details ? { success: false, error, details } : { success: false, error },
    { status },
  );
}
