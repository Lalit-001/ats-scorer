import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { auth } from "../api/client";
import { TopBar } from "./TopBar";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!auth.isLoggedIn()) {
    return <Navigate to="/admin/login" replace />;
  }
  return (
    <>
      <TopBar />
      <div className="container">{children}</div>
    </>
  );
}
