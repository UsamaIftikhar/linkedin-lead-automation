'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  {
    activeClass: 'bg-slate-900 text-white shadow-sm',
    href: '/job-boards',
    label: 'Job boards',
  },
  {
    activeClass: 'bg-emerald-800 text-white shadow-sm',
    href: '/upwork',
    label: 'Upwork',
  },
  {
    activeClass: 'bg-violet-700 text-white shadow-sm',
    href: '/chat',
    label: 'Qwen chat',
  },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <nav
        aria-label="Primary"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-white/80 p-1.5 shadow-sm backdrop-blur"
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? item.activeClass
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </main>
  );
}
