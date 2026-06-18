import { Link, useNavigate } from "react-router-dom";
import { auth } from "../api/client";

export function TopBar() {
  const navigate = useNavigate();
  const loggedIn = auth.isLoggedIn();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link to="/admin" className="group flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 font-mono text-sm font-semibold text-white">
            ⌖
          </span>
          <span className="text-sm font-semibold tracking-tight">
            ATS Resume Scorer
          </span>
        </Link>
        {loggedIn && (
          <button
            onClick={() => {
              auth.clear();
              navigate("/admin/login");
            }}
            className="rounded-md px-2.5 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
