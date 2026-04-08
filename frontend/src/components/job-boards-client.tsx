'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { fetchJobs, getLeads, getLeadStats } from '@/lib/api';
import type { FetchJobsFilters, Lead } from '@/types/api';
import { StatCard } from './stat-card';
import { LeadEmailComposeModal } from './lead-email-compose-modal';

const PLATFORM_OPTIONS = [
  { label: 'All platforms', value: 'all' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Indeed', value: 'indeed' },
  { label: 'Glassdoor', value: 'glassdoor' },
  { label: 'ZipRecruiter', value: 'ziprecruiter' },
  { label: 'Monster', value: 'monster' },
  { label: 'CareerBuilder', value: 'careerbuilder' },
  { label: 'beBee', value: 'beBee' },
] as const;

const DATE_POSTED_OPTIONS = [
  { label: 'Any time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 3 days', value: '3days' },
  { label: 'Last week', value: 'week' },
  { label: 'Last month', value: 'month' },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { label: 'Full-time', value: 'FULLTIME' },
  { label: 'Contract', value: 'CONTRACTOR' },
  { label: 'Part-time', value: 'PARTTIME' },
  { label: 'Internship', value: 'INTERN' },
] as const;

const JOB_REQUIREMENT_OPTIONS = [
  { label: 'Under 3 years', value: 'under_3_years_experience' },
  { label: '3+ years', value: 'more_than_3_years_experience' },
  { label: 'No experience', value: 'no_experience' },
  { label: 'No degree', value: 'no_degree' },
] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

function SelectChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12.75 12.75 16.25 16.25M14.25 8.25a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 9.75a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M15 7.5c0 4.5-6 9-6 9S3 12 3 7.5a6 6 0 1 1 12 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type FilterSectionProps = {
  children: ReactNode;
  description?: string;
  title: string;
};

function FilterSection({ children, description, title }: FilterSectionProps) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function JobBoardsClient() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('software engineer');
  const [location, setLocation] = useState('remote');
  const [platform, setPlatform] = useState('all');
  const [datePosted, setDatePosted] =
    useState<FetchJobsFilters['datePosted']>('all');
  const [workFromHome, setWorkFromHome] = useState(false);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [jobRequirements, setJobRequirements] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [composeLead, setComposeLead] = useState<Lead | null>(null);

  const statsQuery = useQuery({
    queryFn: getLeadStats,
    queryKey: ['lead-stats'],
  });

  const leadsQuery = useQuery({
    queryFn: getLeads,
    queryKey: ['leads'],
  });

  const patchLeadInCache = (updated: Lead) => {
    queryClient.setQueryData<Lead[]>(['leads'], (rows) => {
      if (!rows?.length) {
        return rows;
      }
      return rows.map((row) => (row.id === updated.id ? updated : row));
    });
  };

  const refreshDashboard = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['lead-stats'] }),
      queryClient.refetchQueries({ queryKey: ['leads'] }),
    ]);
  };

  const fetchJobsMutation = useMutation({
    mutationFn: () =>
      fetchJobs({
        datePosted,
        employmentTypes,
        jobRequirements,
        keyword,
        location,
        platform,
        workFromHome,
      }),
    onError: (error) => {
      setActionMessage(getErrorMessage(error));
    },
    onSuccess: async (result) => {
      const platformText = result.platform ? ` via ${result.platform}` : '';
      setActionMessage(
        `Fetched ${result.fetched} jobs and inserted ${result.inserted} new leads for ${result.keyword} in ${result.location}${platformText}.`,
      );
      await refreshDashboard();
    },
  });

  const stats = statsQuery.data ?? {
    contacted: 0,
    total: 0,
    uncontacted: 0,
  };
  const leads = leadsQuery.data ?? [];
  const isLoading = statsQuery.isLoading || leadsQuery.isLoading;
  const isMutating = fetchJobsMutation.isPending;
  const queryError = statsQuery.error ?? leadsQuery.error;

  const optionalFilterCount = useMemo(() => {
    let n = 0;
    if (platform !== 'all') n += 1;
    if (datePosted !== 'all') n += 1;
    if (workFromHome) n += 1;
    n += employmentTypes.length;
    n += jobRequirements.length;
    return n;
  }, [
    datePosted,
    employmentTypes.length,
    jobRequirements.length,
    platform,
    workFromHome,
  ]);

  const clearOptionalFilters = () => {
    setPlatform('all');
    setDatePosted('all');
    setWorkFromHome(false);
    setEmploymentTypes([]);
    setJobRequirements([]);
  };

  const toggleSelection = (
    value: string,
    setSelectedValues: Dispatch<SetStateAction<string[]>>,
  ) => {
    setSelectedValues((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  return (
    <>
      <LeadEmailComposeModal
        key={composeLead?.id ?? 'compose-closed'}
        lead={composeLead}
        onClose={() => setComposeLead(null)}
        onLeadUpdated={(updated) => {
          patchLeadInCache(updated);
          setComposeLead(updated);
          void refreshDashboard();
        }}
        onSent={async () => {
          setActionMessage('Email sent and lead marked as contacted.');
          await refreshDashboard();
        }}
      />

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">
            Cold Outreach Dashboard
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Manage job leads, enrichment, and outbound campaigns in one clean
            workspace.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Pull jobs from JSearch, enrich company domains with Hunter, and send
            careful outbound email through Resend with clear status tracking.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Total Leads" value={stats.total} />
        <StatCard label="Contacted" value={stats.contacted} tone="success" />
        <StatCard
          label="Uncontacted"
          value={stats.uncontacted}
          tone="warning"
        />
      </section>

      <section className="grid gap-6 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur lg:grid-cols-[2.3fr_1fr]">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setActionMessage(null);
            void fetchJobsMutation.mutateAsync();
          }}
        >
          <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
                Job search
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                Find roles that match your pipeline
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                Start with a keyword and location, then narrow by board, how
                recent the post is, and role details—optional filters stack
                together.
              </p>
            </div>
            {optionalFilterCount > 0 ? (
              <button
                className="shrink-0 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                disabled={isMutating}
                onClick={clearOptionalFilters}
                type="button"
              >
                Clear optional filters
                <span className="ml-1.5 rounded-md bg-sky-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-sky-800 tabular-nums">
                  {optionalFilterCount}
                </span>
              </button>
            ) : null}
          </div>

          <FilterSection
            description="These two fields drive the API search. Everything below refines the result."
            title="What are you looking for?"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="group flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Job keyword
                </span>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition group-focus-within:text-sky-600" />
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-sm text-slate-900 shadow-inner shadow-slate-200/40 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100/80"
                    disabled={isMutating}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="e.g. product designer, SDR"
                    value={keyword}
                  />
                </div>
              </label>
              <label className="group flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </span>
                <div className="relative">
                  <MapPinIcon className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition group-focus-within:text-sky-600" />
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-sm text-slate-900 shadow-inner shadow-slate-200/40 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100/80"
                    disabled={isMutating}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="City, region, or remote"
                    value={location}
                  />
                </div>
              </label>
            </div>
          </FilterSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <FilterSection
              description="Choose where listings are aggregated from."
              title="Source"
            >
              <label className="flex flex-col gap-2">
                <span className="sr-only">Platform</span>
                <div className="relative">
                  <select
                    className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-11 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100/80 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMutating}
                    onChange={(event) => setPlatform(event.target.value)}
                    value={platform}
                  >
                    {PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <SelectChevronIcon className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </label>
            </FilterSection>

            <FilterSection
              description="Fresh posts often yield better reply rates."
              title="Date posted"
            >
              <div
                className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
                role="group"
              >
                {DATE_POSTED_OPTIONS.map((option) => {
                  const selected = datePosted === option.value;

                  return (
                    <button
                      aria-pressed={selected}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                        selected
                          ? 'border-sky-500 bg-sky-600 text-white shadow-sm shadow-sky-900/15'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      disabled={isMutating}
                      key={option.value}
                      onClick={() =>
                        setDatePosted(option.value as FetchJobsFilters['datePosted'])
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          </div>

          <FilterSection
            description="Toggle remote-only, employment style, and candidate-facing requirements."
            title="Refine results"
          >
            <div className="space-y-6">
              <button
                aria-pressed={workFromHome}
                className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 sm:max-w-md ${
                  workFromHome
                    ? 'border-sky-300 bg-sky-50/80 shadow-sm shadow-sky-900/5'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                disabled={isMutating}
                onClick={() => setWorkFromHome((v) => !v)}
                type="button"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Remote only
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Hide roles that require full-time on-site.
                  </p>
                </div>
                <span
                  aria-hidden
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
                    workFromHome ? 'bg-sky-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      workFromHome ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Employment types
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => {
                      const selected = employmentTypes.includes(option.value);

                      return (
                        <button
                          aria-pressed={selected}
                          className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                            selected
                              ? 'border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                          disabled={isMutating}
                          key={option.value}
                          onClick={() =>
                            toggleSelection(option.value, setEmploymentTypes)
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Candidate requirements
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {JOB_REQUIREMENT_OPTIONS.map((option) => {
                      const selected = jobRequirements.includes(option.value);

                      return (
                        <button
                          aria-pressed={selected}
                          className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                            selected
                              ? 'border-violet-500 bg-violet-50 text-violet-900 ring-1 ring-violet-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                          disabled={isMutating}
                          key={option.value}
                          onClick={() =>
                            toggleSelection(option.value, setJobRequirements)
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </FilterSection>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 sm:max-w-xs">
              <span className="font-medium text-slate-700">Tip:</span> tighter
              date windows and remote-only often produce higher-quality leads.
            </p>
            <button
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 via-slate-900 to-sky-900 px-8 text-sm font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:from-slate-800 hover:to-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:min-w-[200px]"
              disabled={!keyword.trim() || !location.trim() || isMutating}
              type="submit"
            >
              {fetchJobsMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Fetching…
                </span>
              ) : (
                'Fetch jobs'
              )}
            </button>
          </div>
        </form>

        <div className="flex flex-col justify-between gap-6 rounded-3xl bg-[linear-gradient(135deg,#0f172a,#172554)] p-6 text-white shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
              Manual outreach
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              Review every message before it goes out.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Automatic bulk sends are off. Open a lead from the table, copy the
              enriched address, generate an AI or template draft, edit, then
              send once you are happy with it.
            </p>
          </div>
          <p className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs leading-relaxed text-slate-300">
            Scheduled pipeline emails are disabled unless you set{' '}
            <code className="rounded bg-white/10 px-1 text-sky-100">
              PIPELINE_AUTO_SEND_EMAILS=true
            </code>{' '}
            on the server.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Leads</h2>
            <p className="text-sm text-slate-500">
              Copy emails, compose, and send one lead at a time.
            </p>
          </div>
          {isLoading ? (
            <span className="text-sm text-slate-500">Loading...</span>
          ) : (
            <span className="text-sm text-slate-500">{leads.length} leads</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-6 py-3 font-medium text-slate-500">Company</th>
                <th className="px-6 py-3 font-medium text-slate-500">Role</th>
                <th className="px-6 py-3 font-medium text-slate-500">Email</th>
                <th className="px-6 py-3 font-medium text-slate-500">Status</th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">
                      {lead.companyName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{lead.location}</span>
                      {lead.jobPublisher ? (
                        <>
                          <span aria-hidden className="text-slate-300">
                            ·
                          </span>
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                            {lead.jobPublisher}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <a
                      className="font-medium text-slate-900 hover:text-sky-700"
                      href={lead.applyLink}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {lead.jobTitle}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {lead.email ?? 'Pending enrichment'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        lead.contacted
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {lead.contacted ? 'Contacted' : 'Uncontacted'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                      onClick={() => {
                        setActionMessage(null);
                        setComposeLead(lead);
                      }}
                      type="button"
                    >
                      Compose
                    </button>
                  </td>
                </tr>
              ))}
              {!leads.length && !isLoading ? (
                <tr>
                  <td
                    className="px-6 py-8 text-center text-sm text-slate-500"
                    colSpan={5}
                  >
                    No leads yet. Fetch jobs to populate the pipeline.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {actionMessage ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
          {actionMessage}
        </section>
      ) : null}

      {queryError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {getErrorMessage(queryError)}
        </section>
      ) : null}
    </>
  );
}
