import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Apply } from "./pages/Apply";
import { Login } from "./pages/Login";
import { AdminJobs } from "./pages/AdminJobs";
import { EditJob } from "./pages/EditJob";
import { JobApplicants } from "./pages/JobApplicants";
import { ApplicationDetailPage } from "./pages/ApplicationDetail";

export function App() {
  return (
    <Routes>
      <Route path="/apply/:slug" element={<Apply />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminJobs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/jobs/:id"
        element={
          <ProtectedRoute>
            <JobApplicants />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/jobs/:id/edit"
        element={
          <ProtectedRoute>
            <EditJob />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/applications/:id"
        element={
          <ProtectedRoute>
            <ApplicationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
