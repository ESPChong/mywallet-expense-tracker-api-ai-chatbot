import { toDisplayContext, type ChatbotContext } from './chatbotContextService';
import {
  chatbotToolManifest,
  getMonthBreakdown,
  getMonthBreakdownParams,
  listExpenses,
  listExpensesParams,
} from './chatbotToolsService';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
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
- Every amount in the data below and in tool results is a DOLLAR figure, already converted. Quote it exactly as written, prefixed with $ (e.g. "353.90" → "$353.90"). NEVER append or remove zeros, NEVER convert units, NEVER recompute sums, differences, or percentages yourself — quote the pre-computed values (net, percentage, projections) that are already provided.
- All amounts are in ${context.currency} — quote them with the same currency prefix the data uses.
- Only use numbers present verbatim in the data below or returned by tools. If a figure isn't there, say so plainly instead of calculating it.
- "Today" is ${context.asOf} (UTC). Use it for any reasoning about the current month or the future.
- When quoting projection numbers, mention the confidence level.
- Be concise. Use markdown tables for category breakdowns. Do not pad answers with generic advice unless asked.
- This is informational, not financial advice.

USER FINANCIAL DATA (JSON — all amounts are dollars):
 ${JSON.stringify(toDisplayContext(context), null, 2)}`;
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

// Built from the NUMERIC context — offline mode doesn't involve the model, so
// it keeps its own deterministic formatting.
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
// lcTools: model-facing definitions (name/description/schema for bindTools).
// executors: our own execution path — args are zod-parsed inside the service
// functions, so raw model output is validated before it touches the DB.
// If your @langchain/core version rejects the Zod 4 schema in tool(), replace
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

  const lcTools: StructuredToolInterface[] = [monthBreakdown, list];

  const executors: Record<string, (args: unknown) => Promise<string>> = {
    get_month_breakdown: async (args) => JSON.stringify(await getMonthBreakdown(userId, args)),
    list_expenses: async (args) => JSON.stringify(await listExpenses(userId, args)),
  };

  return { lcTools, executors };
}

// Plain {role, content} → real message instances. Version-stable.
function toMessages(payload: ChatbotModelPayload): BaseMessage[] {
  return payload.messages.map((m) => {
    if (m.role === 'system') return new SystemMessage(m.content);
    if (m.role === 'assistant') return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });
}

// Last AI message with actual text — skips tool-call-only messages.
function extractReply(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!(m instanceof AIMessage)) continue;
    if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  }
  return null;
}

// Hard cap: a confused model must not spin forever.
const MAX_MODEL_CALLS = 6;

/**
 * Minimal ReAct loop, built only on stable @langchain/core primitives:
 * model call → tool calls? → execute → feed results back → repeat, until the
 * model answers in plain text or the call cap is hit.
 */
async function runToolLoop(
  model: BaseChatModel,
  lcTools: StructuredToolInterface[],
  executors: Record<string, (args: unknown) => Promise<string>>,
  messages: BaseMessage[],
): Promise<BaseMessage[]> {
  // bindTools is optional on BaseChatModel — models without tool support run
  // answer-only (context still grounds them); ChatOllama implements it.
  const boundModel = model.bindTools ? model.bindTools(lcTools) : model;
  const history = [...messages];

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    const ai = (await boundModel.invoke(history)) as AIMessage;
    history.push(ai);

    const toolCalls = ai.tool_calls ?? [];
    if (toolCalls.length === 0) return history; // final answer

    for (const tc of toolCalls) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[chatbot] tool: ${tc.name}`, JSON.stringify(tc.args));
      }
      const execute = executors[tc.name];
      let output: string;
      if (execute) {
        try {
          output = await execute(tc.args);
        } catch (error) {
          console.error(`Chatbot tool ${tc.name} failed:`, error);
          output = JSON.stringify({ error: 'Tool execution failed' });
        }
      } else {
        output = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
      }
      history.push(new ToolMessage({ content: output, tool_call_id: tc.id ?? 'call' }));
    }
  }
  return history; // hit the cap without a final answer → caller falls back
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
      const { lcTools, executors } = createChatbotTools(args.user.id);
      const resultMessages = await runToolLoop(model, lcTools, executors, toMessages(payload));
      const reply = extractReply(resultMessages);
      if (reply) return { reply, mode: 'llm', payload };
      // Model ended without final text → fall through to offline
    } catch (error) {
      console.error('Chatbot LLM error — falling back to offline mode:', error);
    }
  }

  return { reply: offlineSummary(args.context), mode: 'offline', payload };
}
