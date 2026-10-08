// Development utility: wipes ALL data from the database in DATABASE_URL,
// optionally seeding demo data. Guards:
//   - refuses to run when NODE_ENV=production
//   - echoes host + database name (never credentials) and requires typing
//     the database name to confirm
//   - --yes skips confirmation for CI use only (still NODE_ENV-guarded)

import { PrismaClient } from '@/generated/prisma/client';
import { DEFAULT_CATEGORIES } from '@/lib/default-category';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';

dotenv.config(); // loads .env (dev) only — never .env.production

const prisma = new PrismaClient();

const SEED = process.argv.includes('--seed');
const ASSUME_YES = process.argv.includes('--yes');

function fail(message: string): never {
  console.error(`⛔ ${message}`);
  process.exit(1);
}

async function confirmTarget(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV is production — this script must never run in production.');
  }

  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL is not set (expected in .env for local development).');

  let host: string;
  let dbName: string;
  try {
    const parsed = new URL(url!);
    host = parsed.hostname; // deliberately NOT printing credentials
    dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    fail('DATABASE_URL is not a valid connection string.');
  }

  if (!dbName!) {
    fail('DATABASE_URL contains no database name — refusing to wipe an unnamed target.');
  }

  console.log('⚠️  DESTRUCTIVE OPERATION');
  console.log(`   host     : ${host}`);
  console.log(`   database : ${dbName}`);
  console.log(`   mode     : ${SEED ? 'wipe + seed demo data' : 'wipe (blank state)'}`);
  console.log('');

  if (ASSUME_YES) {
    console.log('--yes given: skipping confirmation.');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Type the database name "${dbName}" to confirm: `)).trim();
  rl.close();

  // Typing the actual target name — not "y" — makes the confirm proportional
  // to the blast radius and immune to muscle-memory "yes".
  if (answer !== dbName) {
    fail('Confirmation did not match — aborting. Nothing was deleted.');
  }
}

async function wipe(): Promise<void> {
  console.log('\n🗑️  Wiping all data…');
  // Children first — deterministic, no reliance on cascade emulation
  await prisma.incomeEntry.deleteMany();
  await prisma.income.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Database is blank.');
}

async function seed(): Promise<void> {
  console.log('\n🌱 Seeding demo data…');

  const user = await prisma.user.create({
    data: {
      name: 'Dev Tester',
      email: 'dev@example.com',
      password: await bcrypt.hash('devpassword123', 12),
    },
  });

  const categories = await Promise.all(
    DEFAULT_CATEGORIES.map((name) => prisma.category.create({ data: { name, userId: user.id } })),
  );
  const categoryId = new Map(categories.map((c) => [c.name, c.id]));

  // ---- recurring incomes (createdAt backdated to match their history —
  // keeps them consistent with the retroactive-posting guard AND the
  // cleanup-retroactive-entries script) ----
  const now = new Date();
  const monthsBack = (n: number, day: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day));
  const periodOf = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  const salary = await prisma.income.create({
    data: {
      name: 'Salary',
      amount: 500000,
      dayOfMonth: 1,
      active: true,
      createdAt: monthsBack(3, 1),
      userId: user.id,
    },
  });
  const freelance = await prisma.income.create({
    data: {
      name: 'Freelance',
      amount: 60000,
      dayOfMonth: 15,
      active: true,
      createdAt: monthsBack(3, 1),
      userId: user.id,
    },
  });

  // Entries: previous two months + current (freelance's current-month entry
  // only once the 15th has passed, so the projection's remaining-income
  // stays realistic)
  for (let n = 2; n >= 0; n--) {
    const sDate = monthsBack(n, 1);
    await prisma.incomeEntry.create({
      data: {
        amount: 500000,
        date: sDate,
        period: periodOf(sDate),
        incomeId: salary.id,
        userId: user.id,
      },
    });
    if (n > 0 || now.getUTCDate() >= 15) {
      const fDate = monthsBack(n, 15);
      await prisma.incomeEntry.create({
        data: {
          amount: 60000,
          date: fDate,
          period: periodOf(fDate),
          incomeId: freelance.id,
          userId: user.id,
        },
      });
    }
  }
  await prisma.income.updateMany({
    where: { userId: user.id },
    data: { lastPostedPeriod: periodOf(monthsBack(0, 1)) },
  });

  // ---- expenses across current + previous month ----
  // (Current-month rows may be dated slightly in the future early in the
  // month — fine for demo data.)
  const expenseRows = [
    ['Rent', 120000, 'rent', monthsBack(0, 1)],
    ['Bus pass', 6000, 'travel', monthsBack(0, 2)],
    ['Electric bill', 8500, 'utilities', monthsBack(0, 3)],
    ['Groceries — week 1', 7425, 'groceries', monthsBack(0, 5)],
    ['Coffee beans', 1899, 'food', monthsBack(0, 7)],
    ['Gym membership', 4500, 'healthcare', monthsBack(0, 10)],
    ['Groceries — week 2', 6850, 'groceries', monthsBack(0, 12)],
    ['Movie night', 3200, 'entertainment', monthsBack(0, 14)],
    ['Rent', 120000, 'rent', monthsBack(1, 1)],
    ['Groceries — week 1', 8210, 'groceries', monthsBack(1, 4)],
    ['Dentist', 13500, 'healthcare', monthsBack(1, 6)],
    ['Weekend trip', 24500, 'travel', monthsBack(1, 9)],
    ['Groceries — week 2', 7640, 'groceries', monthsBack(1, 11)],
    ['Concert tickets', 9800, 'entertainment', monthsBack(1, 13)],
    ['Internet bill', 6500, 'utilities', monthsBack(1, 15)],
    ['Books', 4200, 'education', monthsBack(1, 20)],
  ] as const;

  await prisma.expense.createMany({
    data: expenseRows.map(([name, amount, category, date]) => ({
      name,
      amount,
      categoryId: categoryId.get(category) ?? null,
      date,
      userId: user.id,
    })),
  });

  console.log('✅ Seeded.');
  console.log('   login: dev@example.com / devpassword123 (dev-only credentials)');
}

async function main() {
  await confirmTarget();
  await wipe();
  if (SEED) await seed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
