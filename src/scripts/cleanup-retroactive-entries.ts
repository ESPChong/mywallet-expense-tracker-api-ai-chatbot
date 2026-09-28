import { PrismaClient } from '@/generated/prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const incomes = await prisma.income.findMany({ select: { id: true, createdAt: true } });
  const creationByIncome = new Map(incomes.map((i) => [i.id, periodOf(i.createdAt)]));

  const entries = await prisma.incomeEntry.findMany({
    select: { id: true, incomeId: true, period: true },
  });

  // Entries dated before their parent income existed (or whose parent is gone)
  const phantom = entries.filter((e) => {
    const creation = creationByIncome.get(e.incomeId);
    return creation === undefined || e.period < creation;
  });

  if (phantom.length === 0) {
    console.log('✅ No retroactive income entries — nothing to clean up.');
    return;
  }

  console.log(`🗑️  Deleting ${phantom.length} retroactive income entries:`);
  for (const e of phantom) console.log(`   period ${e.period} (income ${e.incomeId})`);

  await prisma.incomeEntry.deleteMany({ where: { id: { in: phantom.map((e) => e.id) } } });
  console.log('✅ Done — total savings now reflects only real income history.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
