'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { sendChatMessages } from '@/lib/api';
import type { ChatMessage } from '@/types/api';

function getErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) {
      return msg.join(', ');
    }
    if (typeof msg === 'string') {
      return msg;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function QwenChatPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async (nextMessages: ChatMessage[]) => {
      return sendChatMessages(nextMessages);
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          content: data.content,
          role: 'assistant',
          ...(data.reasoning_details !== undefined
            ? { reasoning_details: data.reasoning_details }
            : {}),
        },
      ]);
    },
  });

  useEffect(() => {
    listRef.current?.scrollTo({
      behavior: 'smooth',
      top: listRef.current.scrollHeight,
    });
  }, [messages, mutation.isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || mutation.isPending) {
      return;
    }
    const next: ChatMessage[] = [
      ...messages,
      { content: trimmed, role: 'user' },
    ];
    setInput('');
    setMessages(next);
    mutation.mutate(next);
  };

  return (
    <section className="flex min-h-[min(70vh,640px)] flex-col overflow-hidden rounded-[2rem] border border-violet-200/80 bg-gradient-to-b from-white to-violet-50/40 shadow-[0_20px_70px_rgba(91,33,182,0.08)]">
      <div className="border-b border-violet-100/90 bg-white/90 px-8 py-6 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">
          Qwen assistant
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Chat with Qwen
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Backend uses{' '}
          <code className="rounded bg-violet-100/80 px-1.5 py-0.5 text-xs text-violet-900">
            OPENROUTER_API_KEY
          </code>{' '}
          when set (OpenRouter Qwen + reasoning); otherwise{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">QWEN_API_KEY</code>{' '}
          (DashScope). Configure in{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">backend/.env</code>.
        </p>
      </div>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6 sm:px-8"
      >
        {!messages.length && !mutation.isPending ? (
          <p className="rounded-2xl border border-dashed border-violet-200 bg-white/60 px-5 py-8 text-center text-sm text-slate-500">
            Ask anything to get started. Conversation history is kept for this
            session only.
          </p>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}-${m.content.slice(0, 24)}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                m.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'border border-violet-100 bg-white text-slate-800'
              }`}
            >
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {m.role === 'user' ? 'You' : 'Qwen'}
              </span>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' &&
              m.reasoning_details != null &&
              m.reasoning_details !== '' ? (
                <details className="mt-3 border-t border-violet-100 pt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-violet-700">
                    Reasoning trace (sent back for multi-turn)
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700">
                    {typeof m.reasoning_details === 'string'
                      ? m.reasoning_details
                      : JSON.stringify(m.reasoning_details, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        ))}

        {mutation.isPending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              Thinking…
            </div>
          </div>
        ) : null}
      </div>

      {mutation.isError ? (
        <div className="mx-6 mb-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-8">
          {getErrorMessage(mutation.error)}
        </div>
      ) : null}

      <form
        className="border-t border-violet-100 bg-white/95 p-4 backdrop-blur sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="sr-only" htmlFor="qwen-chat-input">
            Message
          </label>
          <textarea
            className="min-h-[88px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner outline-none ring-violet-500/30 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2"
            disabled={mutation.isPending}
            id="qwen-chat-input"
            onChange={(ev) => setInput(ev.target.value)}
            placeholder="Type your message…"
            rows={3}
            value={input}
          />
          <button
            className="h-11 shrink-0 rounded-xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={mutation.isPending || !input.trim()}
            type="submit"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
