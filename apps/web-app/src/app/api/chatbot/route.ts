import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { chatbotRequestSchema } from '@/lib/validations';
import { checkRateLimit, envLimit } from '@/lib/rateLimit';
import { apiError } from '@/lib/api-response';
import { buildChatbotContext } from '@/services/chatbotContextService';
import { generateChatbotReply } from '@/services/chatbotService';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError(401, 'Unauthorized');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, 'Invalid JSON body');
    }

    const result = chatbotRequestSchema.safeParse(body);
    if (!result.success) return apiError(400, 'Validation failed', result.error.issues);
    const { message, month, history } = result.data;

    const limit = await checkRateLimit(`chatbot:${user.id}`, envLimit('CHATBOT_DAILY_LIMIT', 50));
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Daily message limit exceeded', resetAt: limit.resetAt },
        { status: 429 },
      );
    }

    let year: number;
    let monthNum: number;
    if (month) {
      [year, monthNum] = month.split('-').map(Number);
    } else {
      const now = new Date();
      year = now.getUTCFullYear();
      monthNum = now.getUTCMonth() + 1;
    }

    // Fresh context every request (POST — materializing due income here is legit)
    const context = await buildChatbotContext(user.id, year, monthNum);
    const { reply, mode, payload } = await generateChatbotReply({
      user,
      context,
      history,
      message,
    });

    const responseBody: { reply: string; mode: string; payload?: unknown } = { reply, mode };
    if (new URL(request.url).searchParams.get('debug') === '1') responseBody.payload = payload;
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('Chatbot API Error:', error);
    return apiError(500, 'Internal Server Error');
  }
}
