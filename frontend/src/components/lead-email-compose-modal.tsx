'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { AxiosError } from 'axios';
import { enrichLeadEmail, generateEmailDraft, sendOneEmail } from '@/lib/api';
import type { EmailDraftSource, Lead } from '@/types/api';

function getErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string | string[] };
    const msg = data?.message;
    if (Array.isArray(msg)) {
      return msg.join(' ');
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

type LeadEmailComposeModalProps = {
  lead: Lead | null;
  onClose: () => void;
  onLeadUpdated?: (lead: Lead) => void;
  onSent: () => void;
};

export function LeadEmailComposeModal({
  lead,
  onClose,
  onLeadUpdated,
  onSent,
}: LeadEmailComposeModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [draftSource, setDraftSource] = useState<EmailDraftSource | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const enrichMutation = useMutation({
    mutationFn: () => enrichLeadEmail(lead!.id),
    onError: (err) => {
      setLocalError(getErrorMessage(err));
    },
    onSuccess: (data) => {
      setLocalError(null);
      onLeadUpdated?.(data);
    },
  });

  const draftMutation = useMutation({
    mutationFn: () => generateEmailDraft(lead!.id),
    onError: (err) => {
      setLocalError(getErrorMessage(err));
    },
    onSuccess: (data) => {
      setLocalError(null);
      setSubject(data.subject);
      setBody(data.body);
      setDraftSource(data.source);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      sendOneEmail({
        body: body.trim(),
        leadId: lead!.id,
        subject: subject.trim(),
      }),
    onError: (err) => {
      setLocalError(getErrorMessage(err));
    },
    onSuccess: () => {
      setLocalError(null);
      onSent();
      onClose();
    },
  });

  if (!lead) {
    return null;
  }

  const email = lead.email?.trim() ?? '';
  const canSend =
    Boolean(email) &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sendMutation.isPending;

  const copyEmail = async () => {
    if (!email) {
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setLocalError('Could not copy to clipboard.');
    }
  };

  return (
    <div
      aria-labelledby="compose-email-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
    >
      <button
        aria-label="Close compose dialog"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wide text-sky-600"
                id="compose-email-title"
              >
                Compose outreach
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {lead.companyName}
              </p>
              <p className="text-xs text-slate-500">{lead.jobTitle}</p>
            </div>
            <button
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {email ? (
                <>
                  <code className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800">
                    {email}
                  </code>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    onClick={() => void copyEmail()}
                    type="button"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-amber-800">
                    No email yet—enrichment is still pending for this lead.
                  </p>
                  <button
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
                    disabled={enrichMutation.isPending}
                    onClick={() => {
                      setLocalError(null);
                      void enrichMutation.mutateAsync();
                    }}
                    type="button"
                  >
                    {enrichMutation.isPending
                      ? 'Looking up email…'
                      : 'Fetch email (Hunter)'}
                  </button>
                  {!lead.domain ? (
                    <p className="text-xs text-slate-500">
                      This listing has no company domain; Hunter cannot run
                      until the job data includes an employer website.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
              disabled={draftMutation.isPending || enrichMutation.isPending}
              onClick={() => {
                setLocalError(null);
                void draftMutation.mutateAsync();
              }}
              type="button"
            >
              {draftMutation.isPending ? 'Generating…' : 'Generate draft'}
            </button>
            {draftSource ? (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${
                  draftSource === 'openai'
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {draftSource === 'openai' ? 'AI draft' : 'Template draft'}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            Review and edit the subject and body before sending. Configure{' '}
            <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code> on
            the server for AI-generated drafts.
          </p>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Subject
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100/80"
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject line"
              value={subject}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Body
            </span>
            <textarea
              className="mt-2 min-h-[200px] w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100/80"
              onChange={(event) => setBody(event.target.value)}
              placeholder="Plain text. Blank lines become paragraphs in the HTML email."
              value={body}
            />
          </label>

          {lead.contacted ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This lead was already marked contacted. Sending again will still
              deliver mail and keep the contacted status.
            </p>
          ) : null}

          {localError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSend}
            onClick={() => void sendMutation.mutateAsync()}
            type="button"
          >
            {sendMutation.isPending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  );
}
