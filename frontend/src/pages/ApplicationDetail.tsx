import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, type ApplicationDetail } from "../api/client";
import { StatusBadge, Recommendation } from "../components/StatusBadge";
import { ScoreMeter } from "../components/ScoreMeter";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, type Tone } from "../components/ui/Badge";

const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-slate-500";
const HEADING = "mb-3 text-sm font-semibold text-slate-900";

function Pill({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls =
    "inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${cls} hover:bg-indigo-50 hover:text-indigo-700`}>
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  );
}

const STAGE_TONE: Record<string, Tone> = {
  done: "emerald",
  failed: "rose",
};

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

  // Poll while the pipeline is still running; stop once terminal.
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

  const resume = app.resume ?? {};
  const links: { category: string; url: string }[] = app.links?.links ?? [];

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
          <button
            onClick={() => navigate(-1)}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </button>
        }
      />

      {/* Status + resume */}
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

      {/* Evaluation */}
      {app.evaluation && (
        <Card className="mb-4">
          <h2 className={HEADING}>Evaluation</h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ScoreMeter score={app.evaluation.matchScore} />
            <Recommendation value={app.evaluation.recommendation} />
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
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

      {/* Basic details (LLM-free) */}
      {app.basicDetails && (
        <Card className="mb-4">
          <h2 className={HEADING}>Basic details (from resume)</h2>
          <p className="-mt-2 mb-3 text-xs text-slate-400">
            Parsed by the PDF pipeline without AI — always available, even when the AI analysis fails.
          </p>
          <dl className="space-y-2 text-sm">
            {app.basicDetails.name_guess && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Name</dt>
                <dd className="text-slate-800">{app.basicDetails.name_guess}</dd>
              </div>
            )}
            {app.basicDetails.emails.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Emails</dt>
                <dd className="font-mono text-xs text-slate-800">
                  {app.basicDetails.emails.join(", ")}
                </dd>
              </div>
            )}
            {app.basicDetails.phones.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Phones</dt>
                <dd className="font-mono text-xs text-slate-800">
                  {app.basicDetails.phones.join(", ")}
                </dd>
              </div>
            )}
          </dl>
          {app.basicDetails.links.length > 0 && (
            <div className="mt-3">
              <p className={SECTION_LABEL}>Links</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {app.basicDetails.links.map((l, i) => (
                  <Pill key={i} href={l}>
                    {l}
                  </Pill>
                ))}
              </div>
            </div>
          )}
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

      {/* Parsed resume */}
      {app.resume && (
        <Card className="mb-4">
          <h2 className={HEADING}>Parsed resume</h2>
          {resume.contact && (
            <p className="mb-3 text-sm text-slate-500">
              {[resume.contact.name, resume.contact.email, resume.contact.location]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {resume.skills?.length > 0 && (
            <div className="mb-4">
              <p className={SECTION_LABEL}>Skills</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resume.skills.map((s: string, i: number) => (
                  <Pill key={i}>{s}</Pill>
                ))}
              </div>
            </div>
          )}
          {resume.experience?.length > 0 && (
            <div className="mb-4">
              <p className={SECTION_LABEL}>Experience</p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {resume.experience.map((x: any, i: number) => (
                  <li key={i}>
                    <span className="font-medium text-slate-900">{x.role}</span> — {x.company}{" "}
                    {x.duration && <span className="text-slate-400">({x.duration})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {resume.education?.length > 0 && (
            <div>
              <p className={SECTION_LABEL}>Education</p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {resume.education.map((x: any, i: number) => (
                  <li key={i}>
                    {x.degree} — {x.institution} {x.year}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Links */}
      {links.length > 0 && (
        <Card className="mb-4">
          <h2 className={HEADING}>Links (incl. icon-embedded)</h2>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <Pill key={i} href={l.url}>
                <span className="mr-1 font-medium text-indigo-600">{l.category}</span>
                {l.url}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      {/* Images */}
      {app.images.length > 0 && (
        <Card className="mb-4">
          <h2 className={HEADING}>Detected images</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {app.images.map((img, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <img
                  className="max-h-40 rounded-md border border-slate-200"
                  src={`${API_BASE}${img.url}`}
                  alt={img.imageType ?? "image"}
                />
                <div className="mt-2 text-xs font-medium text-slate-700">
                  {img.imageType ?? "unclassified"}
                </div>
                {img.details && (
                  <div className="text-xs text-slate-500">
                    {Object.entries(img.details)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
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
