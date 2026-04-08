'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AxiosError } from 'axios';
import { generateUpworkProposal } from '@/lib/api';
import type { UpworkJob } from '@/types/api';

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

function formatSkills(skills: unknown): string {
  if (!Array.isArray(skills)) {
    return '—';
  }
  const labels = skills.filter((s): s is string => typeof s === 'string');
  return labels.length ? labels.join(', ') : '—';
}

type UpworkProposalModalProps = {
  job: UpworkJob;
  onClose: () => void;
};

export function UpworkProposalModal({ job, onClose }: UpworkProposalModalProps) {
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => generateUpworkProposal(job.id),
    onSuccess: (data) => {
      setProposal(data.proposal);
      setSummaries(data.retrievedSummaries ?? null);
      void queryClient.invalidateQueries({ queryKey: ['upwork-jobs'] });
    },
  });

  const copyProposal = async () => {
    if (!proposal) {
      return;
    }
    await navigator.clipboard.writeText(proposal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      aria-labelledby="proposal-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
    >
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Upwork job
            </p>
            <h2
              className="mt-1 text-lg font-semibold leading-snug text-slate-950 sm:text-xl"
              id="proposal-modal-title"
            >
              {job.title}
            </h2>
            <a
              className="mt-1 inline-block text-sm text-emerald-700 underline-offset-2 hover:underline"
              href={job.url}
              rel="noreferrer"
              target="_blank"
            >
              Open on Upwork
            </a>
          </div>
          <button
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">Category</dt>
              <dd className="text-slate-900">{job.categoryName ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Experience</dt>
              <dd className="text-slate-900">{job.experienceLevel ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Location</dt>
              <dd className="text-slate-900">{job.location ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Published</dt>
              <dd className="text-slate-900">
                {job.publishedAt
                  ? new Date(job.publishedAt).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Budget</dt>
              <dd className="text-slate-900">
                {job.budgetType ?? '—'}
                {job.hourlyMinUsd != null && job.hourlyMaxUsd != null
                  ? ` · $${job.hourlyMinUsd}–$${job.hourlyMaxUsd}/hr`
                  : ''}
                {job.budgetTotalUsd ? ` · ${job.budgetTotalUsd}` : ''}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Proposals / pipeline</dt>
              <dd className="text-slate-900">
                {[job.proposals, job.interviewing, job.invitesSent]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-500">Client</dt>
              <dd className="text-slate-900">
                {job.clientScore != null
                  ? `Score ${job.clientScore} · ${job.clientFeedbackCount ?? 0} reviews`
                  : '—'}
                {job.clientSpent ? ` · Spent ${job.clientSpent}` : ''}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-500">Skills</dt>
              <dd className="text-slate-900">{formatSkills(job.skills)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="mb-1 font-medium text-slate-500">Description</dt>
              <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-slate-800">
                {job.description || '—'}
              </dd>
            </div>
          </dl>

          <details className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <summary className="cursor-pointer font-semibold">
              Perfecting RAG: what to add on your side
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900/90">
              <li>
                Edit <code className="rounded bg-white/80 px-1">profile-rag.data.ts</code>{' '}
                (<code className="rounded bg-white/80 px-1">PROFILE_DATASET</code>) as your
                profile changes.
              </li>
              <li>
                Align <strong>tags</strong> with skills you actually want to match (e.g. nextjs,
                prisma, stripe)—they drive pre-filter + fallback ranking.
              </li>
              <li>
                Paste 3–5 full past proposals you liked (redact client names); we can extend the
                schema to store them in Postgres + pgvector for production-scale retrieval.
              </li>
              <li>
                Optional: your default hourly band, timezone, and &quot;never mention X&quot; rules
                so we can fold them into the system prompt.
              </li>
            </ul>
          </details>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              type="button"
            >
              {mutation.isPending ? 'Generating…' : 'Generate proposal'}
            </button>
            {proposal ? (
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                onClick={() => void copyProposal()}
                type="button"
              >
                {copied ? 'Copied' : 'Copy proposal'}
              </button>
            ) : null}
          </div>

          {mutation.isError ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {getErrorMessage(mutation.error)}
            </p>
          ) : null}

          {summaries?.length ? (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">
                RAG snippets used (top matches)
              </summary>
              <ul className="mt-2 space-y-1 font-mono">
                {summaries.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {proposal ? (
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                Proposal
              </p>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                {proposal}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
