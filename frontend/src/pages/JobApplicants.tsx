import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { api, API_BASE, type ApplicantRow } from "../api/client";
import { StatusBadge, Recommendation } from "../components/StatusBadge";
import { DataTable } from "../components/DataTable";
import { ScoreCell } from "../components/ScoreMeter";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { relativeTime } from "../lib/format";

const STATUS_OPTIONS = ["all", "uploaded", "processing", "completed", "failed"] as const;
const REC_OPTIONS = [
  { value: "all", label: "All recommendations" },
  { value: "strong_match", label: "Strong match" },
  { value: "good_match", label: "Good match" },
  { value: "reject", label: "Reject" },
];

const col = createColumnHelper<ApplicantRow>();

/** Debounce a fast-changing value (search box) so filtering stays smooth. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function JobApplicants() {
  const { id } = useParams();
  const [apps, setApps] = useState<ApplicantRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // Filter state — owned here, fed into the table as global + column filters.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [rec, setRec] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const debouncedSearch = useDebounced(search);

  const load = useCallback(() => {
    api
      .listApplications(id!)
      .then((rows) => {
        setApps(rows);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, [id]);

  // Poll so statuses move uploaded -> processing -> completed/failed live.
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const reprocess = useCallback(
    async (appId: string) => {
      await api.reprocess(appId);
      load();
    },
    [load],
  );

  const columns = useMemo(
    () => [
      col.accessor((row) => `${row.name} ${row.email} ${row.basicDetails?.phones?.[0] ?? ""}`, {
        id: "candidate",
        header: "Candidate",
        enableGlobalFilter: true,
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
        cell: ({ row }) => {
          const a = row.original;
          const phone = a.basicDetails?.phones?.[0];
          return (
            <div className="min-w-0">
              <Link
                to={`/admin/applications/${a.id}`}
                className="font-medium text-slate-900 hover:text-indigo-600"
              >
                {a.name}
              </Link>
              <div className="mt-0.5 font-mono text-xs text-slate-500">{a.email}</div>
              {phone && <div className="font-mono text-xs text-slate-500">{phone}</div>}
              <a
                href={`${API_BASE}${a.resumeUrl}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                📄 Resume
              </a>
              {a.status === "failed" && a.errorMessage && (
                <div className="mt-1 text-xs text-rose-600">
                  ⚠ {a.errorStage}: {a.errorMessage}
                </div>
              )}
            </div>
          );
        },
      }),
      col.accessor("status", {
        header: "Status",
        filterFn: "equals",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
      col.accessor((row) => row.matchScore, {
        id: "score",
        header: "Score",
        enableGlobalFilter: false,
        sortingFn: (a, b) => {
          const x = a.getValue<number | null>("score");
          const y = b.getValue<number | null>("score");
          if (x == null && y == null) return 0;
          if (x == null) return -1;
          if (y == null) return 1;
          return x - y;
        },
        filterFn: (row, columnId, value) => {
          const s = row.getValue<number | null>(columnId);
          return s != null && s >= (value as number);
        },
        cell: ({ getValue }) => <ScoreCell score={getValue() as number | null} />,
      }),
      col.accessor("recommendation", {
        header: "Recommendation",
        filterFn: "equals",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <Recommendation value={getValue()} />,
      }),
      col.accessor((row) => new Date(row.createdAt).getTime(), {
        id: "applied",
        header: "Applied",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-slate-500">
            {relativeTime(row.original.createdAt)}
          </span>
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex items-center justify-end gap-3">
              {a.status === "failed" && (
                <Button variant="secondary" size="sm" onClick={() => reprocess(a.id)}>
                  Re-process
                </Button>
              )}
              <Link
                to={`/admin/applications/${a.id}`}
                className="whitespace-nowrap text-sm font-medium text-indigo-600 hover:underline"
              >
                View →
              </Link>
            </div>
          );
        },
      }),
    ],
    [reprocess],
  );

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = [];
    if (status !== "all") f.push({ id: "status", value: status });
    if (rec !== "all") f.push({ id: "recommendation", value: rec });
    if (minScore > 0) f.push({ id: "score", value: minScore });
    return f;
  }, [status, rec, minScore]);

  const table = useReactTable({
    data: apps,
    columns,
    state: { globalFilter: debouncedSearch, columnFilters },
    initialState: { sorting: [{ id: "score", desc: true }] },
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const filtersActive = status !== "all" || rec !== "all" || minScore > 0 || search !== "";

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setRec("all");
    setMinScore(0);
  };

  return (
    <>
      <PageHeader
        title="Applicants"
        subtitle={
          apps.length > 0 ? (
            <>
              Showing <span className="font-medium text-slate-700">{filteredCount}</span> of{" "}
              {apps.length}
            </>
          ) : (
            "Resumes submitted for this job, scored by AI."
          )
        }
        actions={
          <Link to="/admin" className="text-sm font-medium text-indigo-600 hover:underline">
            ← All jobs
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {apps.length > 0 && (
        <Card className="mb-4" noPadding>
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
              <Input
                placeholder="Name, email, or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Recommendation
              </label>
              <Select value={rec} onChange={(e) => setRec(e.target.value)}>
                {REC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Min score: <span className="font-mono text-slate-700">{minScore}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card noPadding className="overflow-hidden">
        {!loaded ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">Loading applicants…</p>
        ) : apps.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">
            No applications yet. Share the apply link to start receiving resumes.
          </p>
        ) : (
          <DataTable
            table={table}
            maxHeight="70vh"
            emptyState={
              <div className="space-y-2">
                <p>No applicants match these filters.</p>
                {filtersActive && (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            }
          />
        )}
      </Card>
    </>
  );
}
