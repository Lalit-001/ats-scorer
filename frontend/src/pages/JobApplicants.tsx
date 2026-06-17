import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ApplicantRow } from "../api/client";
import { StatusBadge, Recommendation } from "../components/StatusBadge";

export function JobApplicants() {
  const { id } = useParams();
  const [apps, setApps] = useState<ApplicantRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.listApplications(id!).then(setApps).catch((e) => setError((e as Error).message));
  }, [id]);

  // Poll so statuses move uploaded -> processing -> completed/failed live.
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const reprocess = async (appId: string) => {
    await api.reprocess(appId);
    load();
  };

  return (
    <>
      <div className="row-between">
        <h1>Applicants</h1>
        <Link to="/admin">← All jobs</Link>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        {apps.length === 0 ? (
          <p className="muted">
            No applications yet. Share the apply link to start receiving resumes.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Status</th>
                <th>Score</th>
                <th>Recommendation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/admin/applications/${a.id}`}>{a.name}</Link>
                    <div className="muted">{a.email}</div>
                    {a.status === "failed" && a.errorMessage && (
                      <div className="muted" style={{ color: "var(--red)" }}>
                        ⚠ {a.errorStage}: {a.errorMessage}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>
                    {a.matchScore != null ? (
                      <span className="score">{a.matchScore}%</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Recommendation value={a.recommendation} />
                  </td>
                  <td>
                    {a.status === "failed" && (
                      <button className="secondary" onClick={() => reprocess(a.id)}>
                        Re-process
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
