import { humanizeEnum } from "../lib/format";

const COLOR_MAP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  posted: "bg-emerald-100 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
  released: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  applied: "bg-amber-100 text-amber-800",
  under_review: "bg-amber-100 text-amber-800",
  past_due: "bg-rose-100 text-rose-800",
  rejected: "bg-rose-100 text-rose-800",
  inactive: "bg-slate-200 text-slate-700",
  resigned: "bg-slate-200 text-slate-700",
  deceased: "bg-slate-200 text-slate-700",
  terminated: "bg-slate-200 text-slate-700",
  restructured: "bg-sky-100 text-sky-800",
};

export function Badge({ value }: { value: string }) {
  const color = COLOR_MAP[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {humanizeEnum(value)}
    </span>
  );
}
