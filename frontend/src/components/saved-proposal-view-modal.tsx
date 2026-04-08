'use client';

import { useState } from 'react';

type SavedProposalViewModalProps = {
  body: string;
  createdAt: string;
  jobTitle: string;
  onClose: () => void;
};

export function SavedProposalViewModal({
  body,
  createdAt,
  jobTitle,
  onClose,
}: SavedProposalViewModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      aria-labelledby="saved-proposal-title"
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
      <div className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
              Saved proposal
            </p>
            <h2
              className="mt-1 text-lg font-semibold leading-snug text-slate-950"
              id="saved-proposal-title"
            >
              {jobTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Generated {new Date(createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              onClick={() => void copy()}
              type="button"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-900">
            {body}
          </pre>
        </div>
      </div>
    </div>
  );
}
