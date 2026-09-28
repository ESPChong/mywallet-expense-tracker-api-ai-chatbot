import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { objectIdSchema, incomeUpdateSchema } from '@/lib/validations';
import { materializeUserIncomeSafe } from '@/services/incomeService';

type RouteParams = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// GET /api/incomes/:id
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid income id' }, { status: 400 });
    }

    const income = await prisma.income.findFirst({ where: { id, userId: user.id } });
    if (!income) return NextResponse.json({ error: 'Income not found' }, { status: 404 });

    return NextResponse.json(income);
  } catch (error) {
    console.error('Get Income Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/incomes/:id
// Updates only affect FUTURE postings — historical IncomeEntry rows are never rewritten.
// "Stop this income" = { active: false } (soft delete, history preserved).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid income id' }, { status: 400 });
    }

    const existing = await prisma.income.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Income not found' }, { status: 404 });

    const result = incomeUpdateSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      );
    }
    const { name, amount, dayOfMonth, active } = result.data;

    const data: { name?: string | null; amount?: number; dayOfMonth?: number; active?: boolean } =
      {};
    if (name !== undefined) data.name = name; // null clears the name
    if (amount !== undefined) data.amount = amount;
    if (dayOfMonth !== undefined) data.dayOfMonth = dayOfMonth;
    if (active !== undefined) data.active = active;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const income = await prisma.income.update({ where: { id }, data });

    await materializeUserIncomeSafe(user.id);

    return NextResponse.json(income);
  } catch (error) {
    console.error('Update Income Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/incomes/:id
// ** Note: because of onDelete: Cascade, this also deletes
// the template's historical entries, which changes all-time savings calculations.
// The frontend's "stop recurring income" button should use PATCH { active: false } instead.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!objectIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid income id' }, { status: 400 });
    }

    const existing = await prisma.income.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Income not found' }, { status: 404 });

    // Entries deleted explicitly so behavior is deterministic, rather than
    // relying on Prisma's client-side emulation of onDelete: Cascade on MongoDB.
    await prisma.incomeEntry.deleteMany({ where: { incomeId: id } });
    await prisma.income.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete Income Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
