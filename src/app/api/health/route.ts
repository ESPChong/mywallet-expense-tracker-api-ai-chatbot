import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Never statically cached — health must reflect the live process.
export const dynamic = 'force-dynamic';

async function probeChatbot(): Promise<'up' | 'down' | 'disabled'> {
  if (process.env.CHATBOT_LLM_DISABLED === 'true') return 'disabled';
  const base = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

// Unauthenticated by design (middleware excludes /api; no rate limit).
// Database health gates the status code; chatbot health is informational —
// a down model server means degraded chatbot, not a dead app.
export async function GET(_request: NextRequest) {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$runCommandRaw({ ping: 1 });
    checks.database = 'up';
  } catch {
    checks.database = 'down';
    healthy = false;
  }

  checks.chatbot = await probeChatbot();

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
