interface StatCardProps {
  label: string;
  value: number | string;
  tone?: 'default' | 'success' | 'warning';
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, string> = {
  default:
    'border-slate-200/80 bg-white/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)]',
  success:
    'border-emerald-200 bg-emerald-50/90 shadow-[0_10px_30px_rgba(16,185,129,0.08)]',
  warning:
    'border-amber-200 bg-amber-50/90 shadow-[0_10px_30px_rgba(245,158,11,0.08)]',
};

export function StatCard({
  label,
  tone = 'default',
  value,
}: StatCardProps) {
  return (
    <div className={`rounded-3xl border p-6 backdrop-blur ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}
