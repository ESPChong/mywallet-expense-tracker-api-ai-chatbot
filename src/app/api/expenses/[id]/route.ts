import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { objectIdSchema, expenseUpdateSchema } from '@/lib/validations';
import { materializeUserIncomeSafe } from '@/services/incomeService';

type RouteParams = { params: Promise<{ id: string }> };

const CATEGORY_INCLUDE = { category: { select: { id: true, name: true } } };

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// GET /api/expenses/:id
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid expense id' }, { status: 400 });
    }

    // Scoped by userId: 404 for both "missing" and "someone else's"
    const expense = await prisma.expense.findFirst({
      where: { id, userId: user.id },
      include: CATEGORY_INCLUDE,
    });
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    return NextResponse.json(expense);
  } catch (error) {
    console.error('Get Expense Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/expenses/:id
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid expense id' }, { status: 400 });
    }

    const existing = await prisma.expense.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    const result = expenseUpdateSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { name, amount, date, categoryId } = result.data;

    const data: { name?: string; amount?: number; date?: Date; categoryId?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = amount;
    if (date !== undefined) data.date = new Date(date);
    if (categoryId !== undefined) {
      if (categoryId !== null) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, userId: user.id },
          select: { id: true },
        });
        if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 });
      }
      data.categoryId = categoryId; // null clears the category
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data,
      include: CATEGORY_INCLUDE,
    });

    await materializeUserIncomeSafe(user.id);

    return NextResponse.json(expense);
  } catch (error) {
    console.error('Update Expense Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/expenses/:id
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid expense id' }, { status: 400 });
    }

    const existing = await prisma.expense.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    await prisma.expense.delete({ where: { id } });

    await materializeUserIncomeSafe(user.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete Expense Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
