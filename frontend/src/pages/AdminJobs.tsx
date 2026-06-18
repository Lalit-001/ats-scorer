import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { api, type JobSummary } from "../api/client";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { relativeTime } from "../lib/format";

// The rich-text editor (TipTap) is heavy and only needed when authoring a job,
// so load it on demand to keep the jobs/applicants views lean.
const JobForm = lazy(() =>
  import("../components/JobForm").then((m) => ({ default: m.JobForm })),
);

const fullUrl = (path: string) => `${window.location.origin}${path}`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

const col = createColumnHelper<JobSummary>();

export function AdminJobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ applyUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = () => api.listJobs().then(setJobs).catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (title: string, description: string) => {
    const res = await api.createJob(title, description);
    setCreated(res);
    setCreating(false);
    load();
  };

  const columns = useMemo(
    () => [
      col.accessor("title", {
        header: "Job",
        enableGlobalFilter: true,
        cell: ({ row }) => (
          <Link
            to={`/admin/jobs/${row.original.id}`}
            className="font-medium text-slate-900 hover:text-indigo-600"
          >
            {row.original.title}
          </Link>
        ),
      }),
      col.accessor("applicants", {
        header: "Applicants",
        enableGlobalFilter: false,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm tabular-nums text-slate-700">{getValue()}</span>
        ),
      }),
      col.accessor((row) => new Date(row.createdAt).getTime(), {
        id: "created",
        header: "Created",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-slate-500">
            {relativeTime(row.original.createdAt)}
          </span>
        ),
      }),
      col.display({
        id: "apply",
        header: "Apply link",
        cell: ({ row }) => {
          const path = `/apply/${row.original.slug}`;
          return (
            <div className="flex items-center gap-1">
              <a
                href={path}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-xs text-indigo-600 hover:underline"
              >
                {path}
              </a>
              <CopyButton text={fullUrl(path)} />
            </div>
          );
        },
      }),
      col.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
            <Link
              to={`/admin/jobs/${row.original.id}/edit`}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600"
            >
              Edit
            </Link>
            <Link
              to={`/admin/jobs/${row.original.id}`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              View →
            </Link>
          </div>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: jobs,
    columns,
    state: { globalFilter: search },
    initialState: { sorting: [{ id: "created", desc: true }] },
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Create a job posting and share its apply link with candidates."
        actions={
          <Button
            onClick={() => {
              setCreating((c) => !c);
              setCreated(null);
            }}
          >
            {creating ? "Close" : "+ New job"}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {created && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/50">
          <p className="text-sm font-medium text-emerald-800">Job created — share this link:</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-white px-3 py-2">
            <span className="truncate font-mono text-sm text-slate-700">
              {fullUrl(created.applyUrl)}
            </span>
            <CopyButton text={fullUrl(created.applyUrl)} />
          </div>
        </Card>
      )}

      {creating && (
        <Card className="mb-4">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">New job description</h2>
          <Suspense fallback={<p className="text-sm text-slate-500">Loading editor…</p>}>
            <JobForm
              submitLabel="Create job"
              busyLabel="Creating…"
              onSubmit={handleCreate}
              onCancel={() => setCreating(false)}
            />
          </Suspense>
        </Card>
      )}

      <Card noPadding className="overflow-hidden">
        {jobs.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">
            No jobs yet. Create your first job posting to get started.
          </p>
        ) : (
          <>
            <div className="border-b border-slate-100 p-3">
              <Input
                placeholder="Search jobs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <DataTable
              table={table}
              emptyState={`No jobs match “${search}”.`}
            />
          </>
        )}
      </Card>
    </>
  );
}
