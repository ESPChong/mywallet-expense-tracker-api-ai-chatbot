import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/services/dashboardService';
import { getCurrentUser } from '@/lib/auth';

// GET /api/dashboard?month=YYYY-MM
export async function GET(request: NextRequest) {
  try {
    // Retrieve user from session cookie
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse month query parameter, defaulting to current month
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');

    let year: number;
    let month: number;

    if (monthParam) {
      const parts = monthParam.split('-');
      if (parts.length !== 2 || !/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
      }
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);

      if (month < 1 || month > 12) {
        return NextResponse.json({ error: 'Invalid month value.' }, { status: 400 });
      }
    } else {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
    }

    // Fetch dashboard data
    const data = await getDashboardData(user.id, year, month);

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
