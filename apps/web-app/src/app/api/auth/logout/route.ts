import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST(_request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;

    if (token) {
      await prisma.session.deleteMany({ where: { sessionToken: hashSessionToken(token) } });
      cookieStore.delete('session_token');
    }

    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
