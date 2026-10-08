import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { expenseCreateSchema, expenseQuerySchema } from '@/lib/validations';
import { materializeUserIncomeSafe } from '@/services/incomeService';

const CATEGORY_INCLUDE = { category: { select: { id: true, name: true } } };

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// GET /api/expenses?month=YYYY-MM&categoryId=<id>&page=1&pageSize=20
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = expenseQuerySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const { month, categoryId, page, pageSize } = parsed.data;

    const where: { userId: string; date?: { gte: Date; lt: Date }; categoryId?: string } = {
      userId: user.id,
    };
    if (month) {
      const [year, mon] = month.split('-').map(Number);
      where.date = { gte: new Date(year, mon - 1, 1), lt: new Date(year, mon, 1) };
    }
    if (categoryId) where.categoryId = categoryId;

    const [total, data] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: CATEGORY_INCLUDE,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error('List Expenses Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/expenses
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const result = expenseCreateSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { name, amount, date, categoryId } = result.data;

    // Ownership check — closes the IDOR that let users link someone else's category
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: user.id },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 400 });
      }
    }

    const expense = await prisma.expense.create({
      data: { name, amount, date: new Date(date), categoryId: categoryId ?? null, userId: user.id },
      include: CATEGORY_INCLUDE,
    });

    await materializeUserIncomeSafe(user.id);

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error('Create Expense Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
