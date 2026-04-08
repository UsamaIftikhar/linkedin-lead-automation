'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { fetchUpworkJobs, getUpworkJobs } from '@/lib/api';
import {
  scoreUpworkJob,
  tierBadgeClass,
  tierRowClass,
} from '@/lib/upwork-job-priority';
import type { FetchUpworkJobsParams, UpworkJob } from '@/types/api';
import { SavedProposalViewModal } from './saved-proposal-view-modal';
import { UpworkProposalModal } from './upwork-proposal-modal';

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
  if (!labels.length) {
    return '—';
  }
  const shown = labels.slice(0, 5);
  const suffix = labels.length > 5 ? ` +${labels.length - 5}` : '';
  return `${shown.join(', ')}${suffix}`;
}

function budgetDetails(job: UpworkJob): ReactNode {
  const lines: ReactNode[] = [];

  if (job.budgetType?.toLowerCase() === 'fixed') {
    lines.push(
      <span key="fixed" className="font-medium">
        {job.budgetTotalUsd ?? 'Fixed'}
      </span>,
    );
  } else if (job.budgetType?.toLowerCase() === 'hourly') {
    if (
      job.hourlyMinUsd != null &&
      job.hourlyMaxUsd != null
    ) {
      lines.push(
        <span key="hr" className="font-medium">
          ${job.hourlyMinUsd}–${job.hourlyMaxUsd}/hr
        </span>,
      );
    } else {
      lines.push(
        <span key="hrl" className="font-medium">
          Hourly
        </span>,
      );
    }
    if (job.hoursPerWeek) {
      lines.push(
        <span key="hpw" className="block text-slate-500">
          {job.hoursPerWeek}
        </span>,
      );
    }
  } else if (job.budgetTotalUsd) {
    lines.push(
      <span key="bud" className="font-medium">
        {job.budgetTotalUsd}
      </span>,
    );
  } else if (job.budgetType) {
    lines.push(
      <span key="bt" className="capitalize">
        {job.budgetType}
      </span>,
    );
  }

  if (!lines.length) {
    return <span className="text-slate-400">—</span>;
  }

  return <div className="space-y-0.5">{lines}</div>;
}

function activityDetails(job: UpworkJob): ReactNode {
  const rows: { key: string; label: string; value: string }[] = [];

  if (job.proposals != null && job.proposals.trim() !== '') {
    rows.push({
      key: 'proposals',
      label: 'Proposals',
      value: job.proposals.trim(),
    });
  }

  if (job.interviewing != null && job.interviewing.trim() !== '') {
    rows.push({
      key: 'interviewing',
      label: 'Interviewing',
      value: job.interviewing.trim(),
    });
  }

  if (job.invitesSent != null && job.invitesSent.trim() !== '') {
    rows.push({
      key: 'invites',
      label: 'Invites sent',
      value: job.invitesSent.trim(),
    });
  }

  if (!rows.length) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="font-semibold text-slate-700">{row.label}:</span>{' '}
          <span className="text-slate-600">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

type UpworkJobsPanelProps = {
  onSaved?: (message: string) => void;
};

export function UpworkJobsPanel({ onSaved }: UpworkJobsPanelProps) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('JavaScript|React');
  const [skills, setSkills] = useState('JavaScript|React');
  const [skillsMatchMode, setSkillsMatchMode] = useState('all');
  const [hourlyMin, setHourlyMin] = useState(10);
  const [hourlyMax, setHourlyMax] = useState(30);
  const [fixedMin, setFixedMin] = useState(100);
  const [fixedMax, setFixedMax] = useState(10_000);
  const [limit, setLimit] = useState(20);
  const [nextCursor, setNextCursor] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [proposalJob, setProposalJob] = useState<UpworkJob | null>(null);
  const [viewSavedProposal, setViewSavedProposal] = useState<{
    body: string;
    createdAt: string;
    jobTitle: string;
  } | null>(null);

  const jobsQuery = useQuery({
    queryFn: getUpworkJobs,
    queryKey: ['upwork-jobs'],
  });

  const fetchMutation = useMutation({
    mutationFn: (params: FetchUpworkJobsParams) => fetchUpworkJobs(params),
    onError: (err) => {
      setLocalError(getErrorMessage(err));
    },
    onSuccess: async (result) => {
      setLocalError(null);
      const cursorHint = result.nextCursor
        ? ' Use “Next page” to pass the cursor for more results.'
        : '';
      const filterHint =
        result.excludedByFilter > 0
          ? ` ${result.excludedByFilter} job(s) skipped (India location, invites sent, or 50+ proposals).`
          : '';
      onSaved?.(
        `Upwork: saved ${result.inserted} new row(s) (${result.skipped} duplicates skipped; ${result.totalFromApi} from API).${filterHint}${cursorHint}`,
      );
      if (result.nextCursor) {
        setNextCursor(result.nextCursor);
      }
      await queryClient.refetchQueries({ queryKey: ['upwork-jobs'] });
    },
  });

  const jobsData = jobsQuery.data;
  const pending = fetchMutation.isPending;

  const rankedJobs = useMemo(() => {
    const list = jobsData ?? [];
    return list
      .map((job) => ({ job, priority: scoreUpworkJob(job) }))
      .sort((a, b) => {
        const ds = b.priority.score - a.priority.score;
        if (ds !== 0) {
          return ds;
        }
        const ta = a.job.publishedAt
          ? new Date(a.job.publishedAt).getTime()
          : 0;
        const tb = b.job.publishedAt
          ? new Date(b.job.publishedAt).getTime()
          : 0;
        return tb - ta;
      });
  }, [jobsData]);

  const jobCount = jobsData?.length ?? 0;

  const submitParams = (): FetchUpworkJobsParams => ({
    fixed_max_usd: fixedMax,
    fixed_min_usd: fixedMin,
    hourly_max_usd: hourlyMax,
    hourly_min_usd: hourlyMin,
    limit,
    q: q.trim() || 'JavaScript|React',
    skills: skills.trim() || 'JavaScript|React',
    skills_match_mode: skillsMatchMode,
    ...(nextCursor.trim() ? { next_cursor: nextCursor.trim() } : {}),
  });

  return (
    <div className="flex flex-col gap-8">
      {proposalJob ? (
        <UpworkProposalModal
          job={proposalJob}
          onClose={() => setProposalJob(null)}
        />
      ) : null}

      {viewSavedProposal ? (
        <SavedProposalViewModal
          body={viewSavedProposal.body}
          createdAt={viewSavedProposal.createdAt}
          jobTitle={viewSavedProposal.jobTitle}
          onClose={() => setViewSavedProposal(null)}
        />
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Upwork (RapidAPI)
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Search and store Upwork jobs
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Fetches from the Upwork jobs API and inserts into{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">upwork_jobs</code>.
            Jobs are omitted (not saved) when the location lists India as a
            country, when invites have been sent, or when the proposals bucket
            indicates 50 or more applicants. Duplicate{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">job_id</code>s are
            skipped.
          </p>
        </div>

        <form
          className="grid gap-4 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setLocalError(null);
            void fetchMutation.mutateAsync(submitParams());
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Query (q)</span>
            <input
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
              disabled={pending}
              onChange={(e) => setQ(e.target.value)}
              value={q}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Skills (pipe-separated)</span>
            <input
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
              disabled={pending}
              onChange={(e) => setSkills(e.target.value)}
              value={skills}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Skills match mode</span>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
              disabled={pending}
              onChange={(e) => setSkillsMatchMode(e.target.value)}
              value={skillsMatchMode}
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Limit</span>
            <input
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
              disabled={pending}
              max={100}
              min={1}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
              type="number"
              value={limit}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Hourly min USD</span>
              <input
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
                disabled={pending}
                min={0}
                onChange={(e) => setHourlyMin(Number(e.target.value))}
                type="number"
                value={hourlyMin}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Hourly max USD</span>
              <input
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
                disabled={pending}
                min={0}
                onChange={(e) => setHourlyMax(Number(e.target.value))}
                type="number"
                value={hourlyMax}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Fixed min USD</span>
              <input
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
                disabled={pending}
                min={0}
                onChange={(e) => setFixedMin(Number(e.target.value))}
                type="number"
                value={fixedMin}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Fixed max USD</span>
              <input
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
                disabled={pending}
                min={0}
                onChange={(e) => setFixedMax(Number(e.target.value))}
                type="number"
                value={fixedMax}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm lg:col-span-2">
            <span className="font-medium text-slate-700">
              Next cursor (optional, from last response)
            </span>
            <textarea
              className="min-h-[72px] rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100/80"
              disabled={pending}
              onChange={(e) => setNextCursor(e.target.value)}
              placeholder="Paste next_cursor after a fetch to load the next page…"
              value={nextCursor}
            />
          </label>

          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Fetching…' : 'Fetch & save to database'}
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              disabled={pending}
              onClick={() => setNextCursor('')}
              type="button"
            >
              Clear cursor
            </button>
          </div>
        </form>

        {localError ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {localError}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Upwork jobs</h2>
            <p className="text-sm text-slate-500">
              Sorted by opportunity score (fresh posts, low proposals, strong
              clients first). Colors show priority tiers.
            </p>
          </div>
          {jobsQuery.isLoading ? (
            <span className="text-sm text-slate-500">Loading...</span>
          ) : (
            <span className="text-sm text-slate-500">{jobCount} rows</span>
          )}
        </div>

        {!jobsQuery.isLoading && jobCount > 0 ? (
          <div className="flex flex-wrap gap-3 border-b border-slate-100 px-6 py-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Legend:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500" />
              High potential
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-lime-500" />
              Strong
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-400" />
              Worth a look
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-slate-200" />
              Lower priority
            </span>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="w-[108px] px-4 py-3 font-medium text-slate-500">
                  Priority
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">Job</th>
                <th className="px-4 py-3 font-medium text-slate-500">Budget</th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Proposals & pipeline
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">Location</th>
                <th className="px-4 py-3 font-medium text-slate-500">Published</th>
                <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                <th className="px-4 py-3 font-medium text-slate-500">Skills</th>
                <th className="px-4 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rankedJobs.map(({ job, priority }) => (
                <tr
                  key={job.id}
                  className={`align-top transition-colors ${tierRowClass(priority.tier)}`}
                  title={priority.reasons.join(' · ')}
                >
                  <td className="px-4 py-4 align-top">
                    <div
                      className={`inline-flex flex-col gap-1 rounded-lg px-2 py-1.5 text-center ${tierBadgeClass(priority.tier)}`}
                    >
                      <span className="text-[0.65rem] font-bold uppercase tracking-wide opacity-90">
                        {priority.label}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums">
                        {priority.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <a
                      className="font-medium text-slate-900 hover:text-emerald-700"
                      href={job.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {job.title}
                    </a>
                    <div className="mt-1 text-xs text-slate-500">
                      {job.categoryName ?? '—'}
                      {job.experienceLevel
                        ? ` · ${job.experienceLevel}`
                        : ''}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{budgetDetails(job)}</td>
                  <td className="min-w-[140px] px-4 py-4 text-slate-600">
                    {activityDetails(job)}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {job.location ?? '—'}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-600">
                    {job.publishedAt
                      ? new Date(job.publishedAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-600">
                    {job.clientScore != null
                      ? `${job.clientScore} · ${job.clientFeedbackCount ?? 0} reviews`
                      : '—'}
                    {job.clientSpent ? (
                      <div className="mt-0.5 text-slate-500">
                        Spent {job.clientSpent}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[200px] px-4 py-4 text-xs text-slate-600">
                    {formatSkills(job.skills)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-1.5">
                      {job.latestProposal ? (
                        <button
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                          onClick={() => {
                            const saved = job.latestProposal;
                            if (!saved) {
                              return;
                            }
                            setViewSavedProposal({
                              body: saved.body,
                              createdAt: saved.createdAt,
                              jobTitle: job.title,
                            });
                          }}
                          type="button"
                        >
                          View proposal
                        </button>
                      ) : null}
                      <button
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 transition hover:bg-violet-100"
                        onClick={() => setProposalJob(job)}
                        type="button"
                      >
                        {job.latestProposal ? 'New proposal' : 'Proposal'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!jobCount && !jobsQuery.isLoading ? (
                <tr>
                  <td
                    className="px-6 py-8 text-center text-sm text-slate-500"
                    colSpan={9}
                  >
                    No Upwork jobs stored yet. Run a fetch above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
