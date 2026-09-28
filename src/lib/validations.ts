import { z } from 'zod';

// ---------- shared primitives ----------

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id format');

const emailSchema = z
  .email('Invalid email address')
  .transform((value) => value.trim().toLowerCase());

// bcrypt silently truncates beyond 72 bytes, so reject longer passwords
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes');

// Accepts 'YYYY-MM-DD' or a full ISO datetime string
const dateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

const amountSchema = z
  .number()
  .int('Amount must be an integer (in cents)')
  .positive('Amount must be greater than 0')
  .max(1_000_000_000_000, 'Amount is too large');

// ---------- auth ----------

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ---------- expenses ----------

export const expenseCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  amount: amountSchema,
  date: dateSchema,
  categoryId: objectIdSchema.optional(),
});

export const expenseUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  amount: amountSchema.optional(),
  date: dateSchema.optional(),
  categoryId: objectIdSchema.nullable().optional(), // null explicitly clears the category
});

export const expenseQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month, expected YYYY-MM')
    .optional(),
  categoryId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- incomes ----------

export const incomeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100).nullish(),
  amount: amountSchema,
  dayOfMonth: z.number().int().min(1).max(31),
});

export const incomeUpdateSchema = incomeCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

// -------- categories ---------

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100, 'Category name is too long'),
});

// ---------- chatbot ----------

export const chatbotRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(2000, 'Message must be at most 2000 characters'),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month, expected YYYY-MM')
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(10, 'History is limited to 10 turns')
    .default([]),
});
