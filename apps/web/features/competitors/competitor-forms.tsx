"use client";

import { Archive, ArchiveRestore, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { DisabledWithReason } from "@/components/ui/tooltip";
import { addCompetitor, setCompetitorArchived, updateCompetitor } from "@/server/actions/competitors";

export function AddCompetitorForm() {
  const router = useRouter();
  const [kind, setKind] = React.useState<"NONE" | "GOOGLE_PLAY" | "CSV">("GOOGLE_PLAY");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ slug: string; imported: number } | null>(null);
  const [pending, start] = React.useTransition();

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-fg">Competitor added.</p>
        <p className="text-fg-muted">
          {done.imported > 0 ? `${done.imported} reviews were imported from your CSV. ` : ""}
          Status: <strong>Awaiting first analysis run.</strong> Analysis runs offline in the Python pipeline so pages stay fast and every number is reproducible.
        </p>
        <pre className="overflow-x-auto rounded-md bg-bg-muted p-3 font-mono text-xs">
          {kind === "GOOGLE_PLAY"
            ? "cd services/pipeline\npython -m pipeline collect --workspace <your-workspace> --market <market>\npython -m pipeline run --provider db --workspace <your-workspace> --market <market>"
            : "cd services/pipeline\npython -m pipeline run --provider db --workspace <your-workspace> --market <market>"}
        </pre>
        <div className="flex gap-2">
          <Button variant="primary" asChild>
            <Link href="/competitors">Back to competitors</Link>
          </Button>
          <Button variant="secondary" onClick={() => { setDone(null); setErrors({}); }}>
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await addCompetitor(fd);
          if (r.ok) {
            setDone(r.data);
            router.refresh();
          } else {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.message);
          }
        });
      }}
    >
      <Field label="Name" htmlFor="name" error={errors.name?.[0]}>
        <Input id="name" name="name" required maxLength={60} aria-invalid={!!errors.name} aria-describedby="name-error" />
      </Field>
      <Field label="Description (optional)" htmlFor="description" error={errors.description?.[0]}>
        <Textarea id="description" name="description" maxLength={300} rows={2} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-fg-muted">Data source</legend>
        {[
          { v: "GOOGLE_PLAY", l: "Google Play package ID", d: "Public reviews collected by the pipeline with a small, polite volume cap." },
          { v: "CSV", l: "Upload a CSV", d: "Columns: text, rating (1–5), date (YYYY-MM-DD), optional app_version. Max 5 MB. Other columns are ignored." },
          { v: "NONE", l: "Add later", d: "Create the competitor now and attach a source later." },
        ].map((o) => (
          <label key={o.v} className="flex cursor-pointer gap-2.5 rounded-md border border-border p-2.5 has-[:checked]:border-ring">
            <input type="radio" name="sourceKind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v as typeof kind)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">{o.l}</span>
              <span className="block text-xs text-fg-muted">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "GOOGLE_PLAY" && (
        <Field label="Package ID" htmlFor="playId" hint="From the Play Store URL, e.g. play.google.com/store/apps/details?id=com.example.app" error={errors.playId?.[0]}>
          <Input id="playId" name="playId" placeholder="com.example.app" aria-invalid={!!errors.playId} aria-describedby="playId-error" />
        </Field>
      )}
      {kind === "CSV" && (
        <Field label="CSV file" htmlFor="csv" error={errors.csv?.[0]}>
          <input id="csv" name="csv" type="file" accept=".csv,text/csv" className="text-sm" aria-invalid={!!errors.csv} aria-describedby="csv-error" />
        </Field>
      )}
      <p className="text-xs text-fg-subtle">
        Only review text, rating, date and app version are stored — never reviewer names or IDs. You are responsible for checking a source&apos;s terms of service.
      </p>
      {message && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm text-negative">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Add competitor
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/competitors">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export function CompetitorRowActions({
  id,
  name,
  description,
  archived,
  readOnlyReason,
}: {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  readOnlyReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (readOnlyReason) {
    return (
      <div className="flex justify-end gap-1">
        <DisabledWithReason reason={readOnlyReason}>
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`}>
            <Pencil />
          </Button>
        </DisabledWithReason>
        <DisabledWithReason reason={readOnlyReason}>
          <Button variant="ghost" size="icon-sm" aria-label={`Archive ${name}`}>
            <Archive />
          </Button>
        </DisabledWithReason>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} title="Edit">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent title={`Edit ${name}`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const r = await updateCompetitor(fd);
                if (r.ok) {
                  setOpen(false);
                  router.refresh();
                } else setError(r.message);
              });
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Field label="Name" htmlFor={`name-${id}`}>
              <Input id={`name-${id}`} name="name" defaultValue={name} required maxLength={60} />
            </Field>
            <Field label="Description" htmlFor={`desc-${id}`}>
              <Textarea id={`desc-${id}`} name="description" defaultValue={description ?? ""} maxLength={300} />
            </Field>
            {error && <p className="text-sm text-negative">{error}</p>}
            <Button type="submit" variant="primary" disabled={pending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={archived ? `Restore ${name}` : `Archive ${name}`}
        title={archived ? "Restore" : "Archive"}
        onClick={() =>
          start(async () => {
            const r = await setCompetitorArchived(id, !archived);
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
      >
        {archived ? <ArchiveRestore /> : <Archive />}
      </Button>
    </div>
  );
}
