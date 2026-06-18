import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type AdminJob } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";

const JobForm = lazy(() =>
  import("../components/JobForm").then((m) => ({ default: m.JobForm })),
);

export function EditJob() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<AdminJob | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getAdminJob(id!).then(setJob).catch((e) => setError((e as Error).message));
  }, [id]);

  const handleSave = async (title: string, description: string) => {
    await api.updateJob(id!, title, description);
    navigate(`/admin/jobs/${id}`);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!job) {
    return <Card className="text-sm text-slate-500">Loading…</Card>;
  }

  return (
    <>
      <PageHeader
        title="Edit job"
        subtitle={job.title}
        actions={
          <Link
            to={`/admin/jobs/${id}`}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </Link>
        }
      />
      <Card>
        {/* JobForm only mounts here once the job has loaded, so the editor
            initializes with the saved description (TipTap reads content on mount). */}
        <Suspense fallback={<p className="text-sm text-slate-500">Loading editor…</p>}>
          <JobForm
            initialTitle={job.title}
            initialDescription={job.description}
            submitLabel="Save changes"
            busyLabel="Saving…"
            onSubmit={handleSave}
            onCancel={() => navigate(`/admin/jobs/${id}`)}
          />
        </Suspense>
      </Card>
    </>
  );
}
