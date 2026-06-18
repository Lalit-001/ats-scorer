import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { RichText } from "../components/RichText";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="mb-6 flex items-center gap-2 text-slate-500">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500 font-mono text-xs font-semibold text-white">
            ⌖
          </span>
          <span className="text-sm font-medium">ATS Resume Scorer</span>
        </div>
        {children}
      </div>
    </div>
  );
}

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
      <PublicShell>
        <Card>
          <h1 className="text-xl font-semibold text-slate-900">Job not found</h1>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        </Card>
      </PublicShell>
    );
  }
  if (!job) {
    return (
      <PublicShell>
        <Card className="text-sm text-slate-500">Loading…</Card>
      </PublicShell>
    );
  }
  if (done) {
    return (
      <PublicShell>
        <Card>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              ✓
            </span>
            <h1 className="text-xl font-semibold text-slate-900">Application received</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Thanks {name || "for applying"} — your resume for <b>{job.title}</b> is being reviewed.
          </p>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <Card className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{job.title}</h1>
        <RichText html={job.description} className="mt-4" />
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Apply for this role</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Resume (PDF)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      </Card>
    </PublicShell>
  );
}
