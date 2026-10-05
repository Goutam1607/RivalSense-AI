"use client";

import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form";
import { DisabledButton } from "@/components/ui/tooltip";
import { RANGES } from "@/lib/date-range";
import { REPORT_SECTIONS } from "@/lib/report-types";
import { createReport, createShareLink, revokeShareLink } from "@/server/actions/reports";

export function ReportBuilder({ marketName, competitors, defaultRange }: { marketName: string; competitors: { id: string; name: string }[]; defaultRange: string }) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createReport(fd);
          if (r.ok) router.push(`/reports/${r.data.id}`);
          else {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.message);
          }
        });
      }}
    >
      <Field label="Title" htmlFor="title" error={errors.title?.[0]}>
        <Input id="title" name="title" defaultValue={`${marketName} — competitive review`} maxLength={120} required aria-describedby="title-error" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Market" htmlFor="market" hint="Switch markets from the top bar.">
          <Input id="market" value={marketName} disabled readOnly />
        </Field>
        <Field label="Date range" htmlFor="range">
          <NativeSelect id="range" name="range" defaultValue={defaultRange}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-fg-muted">Competitors</legend>
        <div className="flex flex-wrap gap-2">
          {competitors.map((c) => (
            <label key={c.id} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-ring">
              <input type="checkbox" name="competitorIds" value={c.id} defaultChecked />
              {c.name}
            </label>
          ))}
        </div>
        {errors.competitorIds && <p className="mt-1 text-xs text-negative">{errors.competitorIds[0]}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-fg-muted">Sections</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {REPORT_SECTIONS.map((s, i) => (
            <label key={s.key} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="sections" value={s.key} defaultChecked />
              <span className="text-fg-subtle tabular">{i + 1}.</span> {s.label}
            </label>
          ))}
        </div>
        {errors.sections && <p className="mt-1 text-xs text-negative">{errors.sections[0]}</p>}
      </fieldset>
      {message && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm text-negative">
          {message}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Generating…" : "Generate report"}
        </Button>
        <p className="mt-2 text-xs text-fg-subtle">The report freezes the current numbers, so it stays the same after later analysis runs.</p>
      </div>
    </form>
  );
}

type LinkRow = { id: string; token: string; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null; accessCount: number };

export function ShareLinks({ reportId, links, readOnlyReason, origin }: { reportId: string; links: LinkRow[]; readOnlyReason: string | null; origin: string }) {
  const router = useRouter();
  const [days, setDays] = React.useState("30");
  const [pending, start] = React.useTransition();
  const [copied, setCopied] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const url = (t: string) => `${origin}/share/${t}`;
  return (
    <div className="space-y-3">
      {readOnlyReason ? (
        <DisabledButton reason={readOnlyReason}>
          <Link2 aria-hidden /> Create share link
        </DisabledButton>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="expiry" className="text-xs text-fg-muted">
              Expires
            </label>
            <NativeSelect id="expiry" value={days} onChange={(e) => setDays(e.target.value)} className="w-36">
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="0">Never</option>
            </NativeSelect>
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createShareLink(reportId, Number(days));
                if (r.ok) router.refresh();
                else setError(r.message);
              })
            }
          >
            <Link2 aria-hidden /> Create share link
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}
      {links.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {links.map((l) => {
            const expired = l.expiresAt && new Date(l.expiresAt) < new Date();
            const active = !l.revokedAt && !expired;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{url(l.token)}</code>
                <span className="text-xs text-fg-subtle">
                  {l.revokedAt ? "Revoked" : expired ? "Expired" : l.expiresAt ? `Expires ${new Date(l.expiresAt).toISOString().slice(0, 10)}` : "No expiry"} · {l.accessCount} views
                </span>
                {active && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(url(l.token));
                        setCopied(l.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      {copied === l.id ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === l.id ? "Copied" : "Copy"}
                    </Button>
                    {!readOnlyReason && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await revokeShareLink(l.id);
                            if (r.ok) router.refresh();
                            else setError(r.message);
                          })
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
