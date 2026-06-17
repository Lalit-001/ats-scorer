import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type JobSummary } from "../api/client";

export function AdminJobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [created, setCreated] = useState<{ applyUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.listJobs().then(setJobs).catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.createJob(title, description);
      setCreated(res);
      setTitle("");
      setDescription("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fullUrl = (path: string) => `${window.location.origin}${path}`;

  return (
    <>
      <div className="card">
        <h1>Job descriptions</h1>
        <p className="muted">Create a job posting and share its apply link with candidates.</p>
      </div>

      <div className="card">
        <h2>New job description</h2>
        <form onSubmit={submit}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
          {error && <div className="error-box">{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button disabled={busy}>{busy ? "Creating…" : "Create job"}</button>
          </div>
        </form>
        {created && (
          <div style={{ marginTop: 16 }}>
            <label>Shareable apply link</label>
            <div className="link-copy">
              <span>{fullUrl(created.applyUrl)}</span>
              <button
                type="button"
                className="secondary"
                onClick={() => navigator.clipboard.writeText(fullUrl(created.applyUrl))}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>All jobs</h2>
        {jobs.length === 0 ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Applicants</th>
                <th>Apply link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link to={`/admin/jobs/${j.id}`}>{j.title}</Link>
                  </td>
                  <td>{j.applicants}</td>
                  <td>
                    <a href={`/apply/${j.slug}`} target="_blank" rel="noreferrer">
                      /apply/{j.slug}
                    </a>
                  </td>
                  <td>
                    <Link to={`/admin/jobs/${j.id}`}>View applicants →</Link>
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
