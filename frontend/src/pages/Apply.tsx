import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";

export function Apply() {
  const { slug } = useParams();
  const [job, setJob] = useState<{ title: string; description: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getJob(slug!).then(setJob).catch((e) => setLoadError((e as Error).message));
  }, [slug]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Please attach your resume PDF.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("email", email);
      form.append("resume", file);
      await api.apply(slug!, form);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="container">
        <div className="card">
          <h1>Job not found</h1>
          <p className="muted">{loadError}</p>
        </div>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="container">
        <div className="card">Loading…</div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card">
          <h1>Application received ✅</h1>
          <p className="muted">
            Thanks {name || "for applying"} — your resume for <b>{job.title}</b> is being reviewed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <div className="card">
        <h1>{job.title}</h1>
        <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
          {job.description}
        </p>
      </div>
      <div className="card">
        <h2>Apply for this role</h2>
        <form onSubmit={submit}>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Resume (PDF)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          {error && <div className="error-box">{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
