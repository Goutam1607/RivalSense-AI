import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportView } from "@/features/reports/report-view";
import { getSharedReport } from "@/server/data/reports";

export const metadata: Metadata = { title: "Shared report", robots: { index: false, follow: false } };

/** Public, read-only report page. Works signed out; stops working when the link is revoked or expires. */
export default async function SharedReportPage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const shared = await getSharedReport(token);
  if (!shared) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">This link is not available</h1>
        <p className="mt-2 text-sm text-fg-muted">The share link is invalid, has expired, or was revoked by its owner.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">
          Go to RivalSense
        </Link>
      </main>
    );
  }
  return (
    <main className="bg-bg-subtle px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between text-sm">
        <span className="text-fg-muted">
          Shared read-only report{shared.expiresAt ? ` · link expires ${shared.expiresAt.toISOString().slice(0, 10)}` : ""}
        </span>
        <a href={`/api/v1/reports/x/pdf?token=${encodeURIComponent(token)}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
          <Download className="size-4" aria-hidden /> Download PDF
        </a>
      </div>
      <ReportView s={shared.snapshot} />
    </main>
  );
}
