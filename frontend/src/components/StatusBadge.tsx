export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function Recommendation({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const label = value.replace("_", " ");
  return <span className={`rec rec-${value}`}>{label}</span>;
}
