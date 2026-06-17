import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../api/client";
import { TopBar } from "../components/TopBar";

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
    <>
      <TopBar />
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="card">
          <h1>Admin login</h1>
          <p className="muted">Enter the admin password to manage jobs and applicants.</p>
          <form onSubmit={submit}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <div className="error-box">{error}</div>}
            <div style={{ marginTop: 16 }}>
              <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
