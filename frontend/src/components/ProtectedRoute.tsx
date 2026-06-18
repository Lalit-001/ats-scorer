import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { auth } from "../api/client";
import { TopBar } from "./TopBar";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!auth.isLoggedIn()) {
    return <Navigate to="/admin/login" replace />;
  }
  return (
    <div className="min-h-screen bg-slate-100">
      <TopBar />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
