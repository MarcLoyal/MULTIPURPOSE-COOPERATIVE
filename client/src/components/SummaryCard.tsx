// Shared by the member portal (PortalPage.tsx) and the staff-facing
// member profile (MemberDetailPage.tsx) — same card, same look, so a
// board member sees the same shape of number whichever side they're on.
const STATUS_BORDER: Record<string, string> = {
  ok: "border-emerald-200",
  warning: "border-amber-300",
  danger: "border-rose-300",
};

const STATUS_VALUE_COLOR: Record<string, string> = {
  ok: "text-slate-900",
  warning: "text-amber-700",
  danger: "text-rose-700",
};

export function SummaryCard({
  label,
  value,
  sub,
  status = "ok",
}: {
  label: string;
  value: string;
  sub?: string;
  status?: "ok" | "warning" | "danger";
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${STATUS_BORDER[status]}`}>
      <p className="text-base text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${STATUS_VALUE_COLOR[status]}`}>{value}</p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
