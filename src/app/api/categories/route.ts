import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { categoryCreateSchema } from '@/lib/validations';
import { apiError } from '@/lib/api-response';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError(401, 'Unauthorized');

    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error('List Categories Error:', error);
    return apiError(500, 'Internal Server Error');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError(401, 'Unauthorized');

    const result = categoryCreateSchema.safeParse(await request.json());
    if (!result.success) return apiError(400, 'Validation failed', result.error.issues);

    const category = await prisma.category.create({
      data: { name: result.data.name, userId: user.id },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return apiError(409, 'Category name already exists');
    }
    console.error('Create Category Error:', error);
    return apiError(500, 'Internal Server Error');
  }
}
