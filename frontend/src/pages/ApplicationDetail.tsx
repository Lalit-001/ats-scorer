import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_BASE, type ApplicationDetail } from "../api/client";
import { StatusBadge, Recommendation } from "../components/StatusBadge";

export function ApplicationDetailPage() {
  const { id } = useParams();
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

  if (error) return <div className="error-box">{error}</div>;
  if (!app) return <div className="card">Loading…</div>;

  const resume = app.resume ?? {};
  const links: { category: string; url: string }[] = app.links?.links ?? [];

  return (
    <>
      <div className="row-between">
        <h1>{app.name}</h1>
        <Link to={`/admin/applications/${app.id}`} onClick={(e) => { e.preventDefault(); history.back(); }}>
          ← Back
        </Link>
      </div>
      <p className="muted">
        {app.email} · applying for <b>{app.job.title}</b>
      </p>

      <div className="card">
        <div className="row-between">
          <StatusBadge status={app.status} />
          {app.status === "failed" && (
            <button className="secondary" onClick={reprocess}>
              Re-process
            </button>
          )}
        </div>
        {app.status === "failed" && (
          <div className="error-box" style={{ marginTop: 12 }}>
            Pipeline failed at <b>{app.errorStage}</b>: {app.errorMessage}
          </div>
        )}
      </div>

      {app.evaluation && (
        <div className="card">
          <h2>Evaluation</h2>
          <div className="row-between">
            <div className="score" style={{ fontSize: 28 }}>
              {app.evaluation.matchScore}%
            </div>
            <Recommendation value={app.evaluation.recommendation} />
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <label>Strengths</label>
              <ul className="clean">
                {app.evaluation.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <label>Gaps</label>
              <ul className="clean">
                {app.evaluation.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {app.resume && (
        <div className="card">
          <h2>Parsed resume</h2>
          {resume.contact && (
            <p className="muted">
              {resume.contact.name} · {resume.contact.email} · {resume.contact.location}
            </p>
          )}
          {resume.skills?.length > 0 && (
            <>
              <label>Skills</label>
              <div className="pill-row">
                {resume.skills.map((s: string, i: number) => (
                  <span className="pill" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
          {resume.experience?.length > 0 && (
            <>
              <label style={{ marginTop: 14 }}>Experience</label>
              <ul className="clean">
                {resume.experience.map((x: any, i: number) => (
                  <li key={i}>
                    <b>{x.role}</b> — {x.company} {x.duration && `(${x.duration})`}
                  </li>
                ))}
              </ul>
            </>
          )}
          {resume.education?.length > 0 && (
            <>
              <label style={{ marginTop: 14 }}>Education</label>
              <ul className="clean">
                {resume.education.map((x: any, i: number) => (
                  <li key={i}>
                    {x.degree} — {x.institution} {x.year}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="card">
          <h2>Links (incl. icon-embedded)</h2>
          <div className="pill-row">
            {links.map((l, i) => (
              <a className="pill" key={i} href={l.url} target="_blank" rel="noreferrer">
                {l.category}: {l.url}
              </a>
            ))}
          </div>
        </div>
      )}

      {app.images.length > 0 && (
        <div className="card">
          <h2>Detected images</h2>
          <div className="grid-2">
            {app.images.map((img, i) => (
              <div key={i}>
                <img className="cert-img" src={`${API_BASE}${img.url}`} alt={img.imageType ?? "image"} />
                <div className="muted">{img.imageType ?? "unclassified"}</div>
                {img.details && (
                  <div className="muted">
                    {Object.entries(img.details)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Pipeline stages</h2>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {app.runs.map((r, i) => (
              <tr key={i}>
                <td>{r.stage}</td>
                <td>
                  <span
                    className={`badge badge-${
                      r.status === "done" ? "completed" : r.status === "failed" ? "failed" : "processing"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="muted">{r.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
