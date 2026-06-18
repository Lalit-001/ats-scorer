import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, type ApplicationDetail, type CategorizedLink } from "../api/client";
import { StatusBadge, Recommendation } from "../components/StatusBadge";
import { ScoreMeter } from "../components/ScoreMeter";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, type Tone } from "../components/ui/Badge";
import { cn } from "../lib/cn";
import { scoreTone, linkLabel } from "../lib/format";

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-slate-500";
const HEADING = "mb-3 text-sm font-semibold text-slate-900";

const DIM_ORDER = [
  "hard_skills",
  "experience_relevance",
  "seniority_scope",
  "education_certs",
  "domain_knowledge",
] as const;
const DIM_LABELS: Record<string, string> = {
  hard_skills: "Hard skills",
  experience_relevance: "Experience relevance",
  seniority_scope: "Seniority / scope",
  education_certs: "Education / certs",
  domain_knowledge: "Domain knowledge",
};

// Show recognized link groups first, in a sensible order; "other" always last.
const LINK_GROUP_ORDER = [
  "linkedin",
  "github",
  "gitlab",
  "portfolio",
  "twitter",
  "stackoverflow",
  "leetcode",
  "hackerrank",
  "codeforces",
  "kaggle",
  "medium",
  "behance",
  "dribbble",
  "youtube",
  "other",
];

function Pill({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${cls} hover:bg-indigo-50 hover:text-indigo-700`}>
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  );
}

function DimensionRow({
  label,
  dim,
}: {
  label: string;
  dim: { score: number; weight: number; reason: string };
}) {
  const tone = scoreTone(dim.score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-700">
          {label}
          <span className="ml-1.5 font-mono text-xs text-slate-400">{Math.round(dim.weight * 100)}%</span>
        </span>
        <span className={cn("font-mono text-sm font-semibold tabular-nums", tone.text)}>{dim.score}</span>
      </div>
      <div className={cn("mt-1 h-1.5 w-full overflow-hidden rounded-full", tone.track)}>
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${dim.score}%` }} />
      </div>
      {dim.reason && <p className="mt-1 text-xs text-slate-500">{dim.reason}</p>}
    </div>
  );
}

const STAGE_TONE: Record<string, Tone> = { done: "emerald", failed: "rose" };

export function ApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.getApplication(id!).then(setApp).catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (app && (app.status === "completed" || app.status === "failed")) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [app?.status, load]);

  const reprocess = async () => {
    await api.reprocess(id!);
    load();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!app) return <Card className="text-sm text-slate-500">Loading…</Card>;

  const resume = app.resume;
  const links = app.links ?? [];
  const certificates = app.images.filter((img) => img.imageType === "certificate");

  // Group links by category for a scannable layout.
  const linksByCategory = links.reduce<Record<string, CategorizedLink[]>>((acc, l) => {
    (acc[l.category] ||= []).push(l);
    return acc;
  }, {});
  const linkGroups = LINK_GROUP_ORDER.filter((c) => linksByCategory[c]?.length);

  return (
    <>
      <PageHeader
        title={app.name}
        subtitle={
          <>
            {app.email} · applying for <span className="font-medium text-slate-700">{app.job.title}</span>
          </>
        }
        actions={
          <button onClick={() => navigate(-1)} className="text-sm font-medium text-indigo-600 hover:underline">
            ← Back
          </button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={app.status} />
            <a
              href={`${API_BASE}${app.resumeUrl}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              📄 View resume (PDF)
            </a>
          </div>
          {app.status === "failed" && (
            <Button variant="secondary" size="sm" onClick={reprocess}>
              Re-process
            </Button>
          )}
        </div>
        {app.status === "failed" && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Pipeline failed at <b>{app.errorStage}</b>: {app.errorMessage}
          </div>
        )}
      </Card>

      {/* Evaluation — rubric breakdown + overall score */}
      {app.evaluation && (
        <Card className="mb-4">
          <h2 className={HEADING}>Evaluation</h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ScoreMeter score={app.evaluation.matchScore} />
            <Recommendation value={app.evaluation.recommendation} />
          </div>

          {app.evaluation.dimensions && (
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <p className={SECTION_LABEL}>Rubric breakdown</p>
              {DIM_ORDER.filter((k) => app.evaluation!.dimensions![k]).map((k) => (
                <DimensionRow key={k} label={DIM_LABELS[k]} dim={app.evaluation!.dimensions![k]} />
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-5 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <p className={SECTION_LABEL}>Strengths</p>
              <ul className="mt-2 space-y-1.5">
                {app.evaluation.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-emerald-500">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className={SECTION_LABEL}>Gaps</p>
              <ul className="mt-2 space-y-1.5">
                {app.evaluation.gaps.map((g, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-rose-400">−</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Certificates — image + extracted details for a quick scan */}
      {certificates.length > 0 && (
        <Card className="mb-4">
          <h2 className={HEADING}>Certificates</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {certificates.map((cert, i) => {
              const d = cert.details ?? {};
              const fields: [string, string | undefined][] = [
                ["Issuer", d.issuer],
                ["Credential", d.name],
                ["Recipient", d.recipient_name],
                ["Issued", d.issue_date],
                ["Expires", d.expiry_date],
                ["Credential ID", d.credential_id],
              ];
              return (
                <div key={i} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                  <a href={`${API_BASE}${cert.url}`} target="_blank" rel="noreferrer" className="shrink-0">
                    <img
                      className="h-24 w-24 rounded-md border border-slate-200 object-cover"
                      src={`${API_BASE}${cert.url}`}
                      alt="certificate"
                    />
                  </a>
                  <dl className="min-w-0 flex-1 space-y-1 text-xs">
                    {fields
                      .filter(([, v]) => v)
                      .map(([label, v]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="w-24 shrink-0 text-slate-400">{label}</dt>
                          <dd className="truncate text-slate-700">{v}</dd>
                        </div>
                      ))}
                    {d.verify_url && (
                      <a
                        href={d.verify_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block pt-1 font-medium text-indigo-600 hover:underline"
                      >
                        Verify →
                      </a>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Links — grouped by category, Unrecognized last */}
      {links.length > 0 && (
        <Card className="mb-4">
          <h2 className={HEADING}>Links</h2>
          <div className="space-y-3">
            {linkGroups.map((category) => (
              <div key={category}>
                <p className={SECTION_LABEL}>{linkLabel(category)}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {linksByCategory[category].map((l, i) => (
                    <Pill key={i} href={l.url}>
                      {l.url}
                    </Pill>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Parsed resume (structured) */}
      {resume && (
        <Card className="mb-4">
          <h2 className={HEADING}>Parsed resume</h2>
          <p className="mb-3 text-sm text-slate-500">
            {[resume.name, resume.experienceYears != null && `${resume.experienceYears} yrs experience`]
              .filter(Boolean)
              .join(" · ")}
            {resume.source === "llm" && (
              <span className="ml-2 text-xs text-slate-400">(AI-structured fallback)</span>
            )}
          </p>
          {resume.skills?.length > 0 && (
            <div className="mb-4">
              <p className={SECTION_LABEL}>Skills</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resume.skills.map((s, i) => (
                  <Pill key={i}>{s}</Pill>
                ))}
              </div>
            </div>
          )}
          {resume.education?.length > 0 && (
            <div className="mb-4">
              <p className={SECTION_LABEL}>Education</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {resume.education.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {resume.certifications?.length > 0 && (
            <div className="mb-4">
              <p className={SECTION_LABEL}>Certifications (from text)</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {resume.certifications.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {resume.experienceText && (
            <div>
              <p className={SECTION_LABEL}>Experience</p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-600">
                {resume.experienceText}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Basic details (LLM-free) */}
      {app.basicDetails && (
        <Card className="mb-4">
          <h2 className={HEADING}>Basic details (from resume)</h2>
          <dl className="space-y-2 text-sm">
            {app.basicDetails.emails.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Emails</dt>
                <dd className="font-mono text-xs text-slate-800">{app.basicDetails.emails.join(", ")}</dd>
              </div>
            )}
            {app.basicDetails.phones.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Phones</dt>
                <dd className="font-mono text-xs text-slate-800">{app.basicDetails.phones.join(", ")}</dd>
              </div>
            )}
          </dl>
          {app.basicDetails.text_preview && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Resume text preview
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
                {app.basicDetails.text_preview}
              </pre>
            </details>
          )}
        </Card>
      )}

      {/* Pipeline stages */}
      <Card noPadding className="overflow-hidden">
        <h2 className={`${HEADING} px-6 pt-6`}>Pipeline stages</h2>
        <table className="w-full border-collapse text-sm">
          <thead className="border-y border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-2.5">Stage</th>
              <th className="px-6 py-2.5">Status</th>
              <th className="px-6 py-2.5">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {app.runs.map((r, i) => (
              <tr key={i}>
                <td className="px-6 py-2.5 font-mono text-xs text-slate-700">{r.stage}</td>
                <td className="px-6 py-2.5">
                  <Badge tone={STAGE_TONE[r.status] ?? "amber"}>{r.status}</Badge>
                </td>
                <td className="px-6 py-2.5 text-xs text-slate-500">{r.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
