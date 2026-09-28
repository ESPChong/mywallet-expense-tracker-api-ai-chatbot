'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useSearchParams } from 'next/navigation';
import { isValidMonthString } from '@/lib/format';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  offline?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'How am I doing this month?',
  'Where is my money going?',
  'What will I end the month at?',
];

export function ChatbotDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOffline = messages.some((m) => m.offline);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isPending]);

  const searchParams = useSearchParams();

  // The offline summary comes back with this prefix until an LLM is wired

  async function send(text: string) {
    const message = text.trim();
    if (!message || isPending) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setIsPending(true);

    try {
      const monthParam = searchParams.get('month');
      const month = isValidMonthString(monthParam) ? monthParam : undefined;

      const res = await api<{ reply: string; mode: 'llm' | 'offline' }>('/api/chatbot', {
        method: 'POST',
        body: { message, history: messages.slice(-10), ...(month && { month }) },
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.reply, offline: res.mode === 'offline' },
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        toast.error('Daily message limit reached — resets at midnight UTC');
      } else {
        toast.error('Something went wrong — try again');
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="icon"
            aria-label="Open AI analyst"
            className="fixed right-6 bottom-6 z-40 h-12 w-12 rounded-full shadow-lg"
          />
        }
      >
        <Sparkles className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary h-4 w-4" />
            AI Chatbot Analyst
            {isOffline && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                offline mode
              </span>
            )}
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                aria-label="Clear conversation"
                onClick={() => setMessages([])}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Ask anything about your finances</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Your data stays fresh — the analyst sees your latest numbers.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => send(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your spending…"
            disabled={isPending}
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={isPending || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
