import { useState, type FormEvent } from "react";
import { JobEditor } from "./JobEditor";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";

/** An editor doc is "empty" if it has no text once tags are stripped. */
const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim().length === 0;

export function JobForm({
  initialTitle = "",
  initialDescription = "",
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string;
  initialDescription?: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (title: string, description: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (isEmptyHtml(description)) {
      setError("Description is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(title.trim(), description);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
        <JobEditor value={initialDescription} onChange={setDescription} />
        <p className="mt-1.5 text-xs text-slate-400">
          Use the toolbar to format — candidates see it exactly as it looks here.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
