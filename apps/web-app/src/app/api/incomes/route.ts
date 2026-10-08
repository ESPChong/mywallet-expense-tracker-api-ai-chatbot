import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { incomeCreateSchema } from '@/lib/validations';
import { materializeUserIncomeSafe } from '@/services/incomeService';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// GET /api/incomes — list recurring income templates
export async function GET(_request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const incomes = await prisma.income.findMany({
      where: { userId: user.id },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ data: incomes });
  } catch (error) {
    console.error('List Incomes Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/incomes — create a recurring income template
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const result = incomeCreateSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { name, amount, dayOfMonth } = result.data;

    const income = await prisma.income.create({
      data: { name: name ?? null, amount, dayOfMonth, active: true, userId: user.id },
    });

    await materializeUserIncomeSafe(user.id);

    return NextResponse.json(income, { status: 201 });
  } catch (error) {
    console.error('Create Income Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
