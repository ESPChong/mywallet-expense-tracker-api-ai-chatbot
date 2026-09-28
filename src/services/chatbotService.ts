import type { ChatbotContext } from './chatbotContextService';
import {
  chatbotToolManifest,
  getMonthBreakdown,
  getMonthBreakdownParams,
  listExpenses,
  listExpensesParams,
} from './chatbotToolsService';
import { isAIMessage, type BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatbotModelPayload {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  tools: typeof chatbotToolManifest;
}

function buildSystemPrompt(context: ChatbotContext): string {
  return `You are the analyst assistant inside a personal expense-tracker app. Answer the user's questions about their own financial data.

RULES:
- All amounts in the data are INTEGER CENTS. Always convert to dollars when speaking to the user (4999 cents = $49.99). Never state raw cent values.
- "Today" is ${context.asOf} (UTC). Use it for any reasoning about the current month or the future.
- Only use numbers present in the data below or returned by tools. Never invent, estimate, or guess figures. If the data cannot answer a question, say so plainly.
- When quoting projection numbers, mention the confidence level.
- Be concise. Use markdown tables for category breakdowns. Do not pad answers with generic advice unless asked.
- This is informational, not financial advice.

USER FINANCIAL DATA (JSON):
 ${JSON.stringify(context, null, 2)}`;
}

// The exact JSON handed to the model; returned by the route when ?debug=1
export function buildModelPayload(args: {
  context: ChatbotContext;
  history: ChatTurn[];
  message: string;
  model?: string;
}): ChatbotModelPayload {
  return {
    model: args.model ?? process.env.CHATBOT_MODEL ?? 'qwen2.5:7b-instruct',
    messages: [
      { role: 'system', content: buildSystemPrompt(args.context) },
      ...args.history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: args.message },
    ],
    tools: chatbotToolManifest,
  };
}

// ── Offline mode ────────────────────────────────────────────────────────────

export const OFFLINE_MODE_PREFIX = '(offline mode — analyst unavailable)';

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function offlineSummary(context: ChatbotContext): string {
  const { currentMonth: m } = context;
  const lines = [
    OFFLINE_MODE_PREFIX,
    `Summary for ${m.period}: income ${formatCents(m.income)}, expenses ${formatCents(m.expenses)}, net ${formatCents(m.net)} across ${m.expenseCount} transactions.`,
  ];
  if (m.topCategories.length > 0) {
    lines.push(
      'Top categories: ' +
        m.topCategories
          .slice(0, 3)
          .map((c) => `${c.name} ${formatCents(c.amount)} (${c.percentage}%)`)
          .join(', ') +
        '.',
    );
  }
  if (context.projection) {
    lines.push(
      `Projected month-end: expenses ${formatCents(context.projection.projectedMonthExpenses)}, net ${formatCents(context.projection.projectedNet)} (confidence: ${context.projection.confidence}).`,
    );
  }
  lines.push(
    'The AI analyst could not be reached — this summary was built directly from your live data.',
  );
  return lines.join('\n');
}

// ── LLM wiring ──────────────────────────────────────────────────────────────

function createDefaultModel(): BaseChatModel {
  return new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.CHATBOT_MODEL ?? 'qwen2.5:7b-instruct',
    temperature: 0.1, // groundedness over creativity
    numCtx: 8192, // Ollama's default context is too small for payload + history
  });
}

// Tools are built per request and close over userId — every tool execution is
// ownership-scoped, exactly like the HTTP routes. Never module singletons.
// ⚠️ If your @langchain/core version rejects the Zod 4 schema here, replace
// `schema: X` with `schema: X.toJSONSchema()` — same runtime behavior.
function createChatbotTools(userId: string) {
  const monthBreakdown = tool(
    async (input: z.input<typeof getMonthBreakdownParams>) =>
      JSON.stringify(await getMonthBreakdown(userId, input)),
    {
      name: 'get_month_breakdown',
      description: chatbotToolManifest[0].description,
      schema: getMonthBreakdownParams,
    },
  );

  const list = tool(
    async (input: z.input<typeof listExpensesParams>) =>
      JSON.stringify(await listExpenses(userId, input)),
    {
      name: 'list_expenses',
      description: chatbotToolManifest[1].description,
      schema: listExpensesParams,
    },
  );

  return [monthBreakdown, list];
}

// Last AI message with actual text content — skips tool-call-only messages
function extractReply(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isAIMessage(m)) continue;
    if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  }
  return null;
}

export type ChatbotMode = 'llm' | 'offline';

export async function generateChatbotReply(
  args: {
    user: { id: string; name: string };
    context: ChatbotContext;
    history: ChatTurn[];
    message: string;
  },
  // Test seam: injected models ALWAYS run — the env flag only gates the
  // default Ollama path.
  deps: { modelFactory?: () => BaseChatModel } = {},
): Promise<{ reply: string; mode: ChatbotMode; payload: ChatbotModelPayload }> {
  const payload = buildModelPayload(args);
  const llmEnabled = deps.modelFactory !== undefined || process.env.CHATBOT_LLM_DISABLED !== 'true';

  if (llmEnabled) {
    try {
      const model = deps.modelFactory ? deps.modelFactory() : createDefaultModel();
      const agent = createReactAgent({
        llm: model,
        tools: createChatbotTools(args.user.id),
        prompt: payload.messages[0].content, // system prompt
      });
      const result = await agent.invoke(
        { messages: payload.messages.slice(1) }, // history + user message
        { recursionLimit: 8 }, // hard cap: ~4 model+tool round trips
      );
      const reply = extractReply((result.messages ?? []) as BaseMessage[]);
      if (reply) return { reply, mode: 'llm', payload };
      // Model ended without a final text message → fall through to offline
    } catch (error) {
      // Ollama down / model missing / agent loop failure → degrade, never 500
      console.error('Chatbot LLM error — falling back to offline mode:', error);
    }
  }

  return { reply: offlineSummary(args.context), mode: 'offline', payload };
}
