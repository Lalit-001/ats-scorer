import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../api/client";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await api.login(password);
      auth.set(token);
      navigate("/admin");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500 font-mono text-sm font-semibold text-white">
            ⌖
          </span>
          <span className="text-base font-semibold tracking-tight text-slate-900">
            ATS Resume Scorer
          </span>
        </div>
        <Card>
          <h1 className="text-lg font-semibold text-slate-900">Admin login</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the admin password to manage jobs and applicants.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
