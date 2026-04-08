'use client';

import { useState } from 'react';
import { UpworkJobsPanel } from './upwork-jobs-panel';

export function UpworkPageClient() {
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  return (
    <>
      <UpworkJobsPanel
        onSaved={(message) => {
          setActionMessage(message);
        }}
      />
      {actionMessage ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
          {actionMessage}
        </section>
      ) : null}
    </>
  );
}
