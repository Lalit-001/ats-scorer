import { Badge, type Tone } from "./ui/Badge";
import { recommendationLabel } from "../lib/format";

const STATUS_TONE: Record<string, Tone> = {
  uploaded: "slate",
  processing: "amber",
  completed: "emerald",
  failed: "rose",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "slate"} dot>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const REC_TONE: Record<string, Tone> = {
  strong_match: "emerald",
  good_match: "indigo",
  reject: "rose",
};

export function Recommendation({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <Badge tone={REC_TONE[value] ?? "slate"}>{recommendationLabel(value)}</Badge>;
}
