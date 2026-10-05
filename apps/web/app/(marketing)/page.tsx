import { ArrowRight, BarChart3, Check, FileText, GitCompareArrows, Lightbulb, MessageSquareText, ShieldCheck, TrendingUp, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, InsightTypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SentimentSplit } from "@/components/ui/score-bar";
import { ExploreDemoButton } from "@/features/auth/auth-forms";
import { HealthTable } from "@/features/dashboard/health-table";
import { DEMO_LABEL, SUGGESTION_LABEL, type InsightTypeKey } from "@/lib/constants";
import { fmtInt, fmtPct } from "@/lib/format";
import { getPublicDemoPreview } from "@/server/data/public-demo";

export const metadata: Metadata = {
  title: "RivalSense — Know what your competitors' customers really think",
};
export const revalidate = 3600; // static page, refreshed hourly from the demo data

const STEPS = [
  { t: "Collect", d: "Public reviews from app stores or your CSV exports, with a small polite volume. Text, rating, date and app version only — no reviewer identities." },
  { t: "Clean", d: "Remove duplicates and spam, detect language, split reviews into clauses at words like “but” and “however”." },
  { t: "Analyse", d: "Tag each clause with aspects such as delivery speed or refunds, and score aspect sentiment with a pre-trained ABSA model." },
  { t: "Measure", d: "Turn mentions into 0–100 scores with Wilson intervals, compare competitors and test whether complaints are really rising." },
  { t: "Act", d: "Read typed insights that link to the exact reviews behind them, and share a report with your team." },
];

// Example findings are described qualitatively: every number on screen must come from the database.
const CAPABILITIES = [
  { Icon: MessageSquareText, t: "Sentiment analysis", e: "Share of positive, neutral and negative reviews per competitor, tracked week by week." },
  { Icon: BarChart3, t: "Aspect analysis", e: "Which topics customers raise — delivery speed, pricing, refunds — and how they feel about each." },
  { Icon: GitCompareArrows, t: "Competitor comparison", e: "Who leads on product availability, with intervals that show whether the lead is real." },
  { Icon: TrendingUp, t: "Trend detection", e: "Refund complaints rising for one app, flagged only when a significance test says so." },
  { Icon: TriangleAlert, t: "Pain points", e: "Recurring complaint themes outside the standard categories, such as rider behaviour." },
  { Icon: Lightbulb, t: "Opportunities", e: "Weaknesses every competitor shares — an opening for whoever fixes them first." },
];

const TIERS = [
  { name: "Analyst", price: "Free", note: "For trying it out", items: ["1 workspace", "Up to 3 competitors", "CSV import", "Template insight wording"], cta: { href: "/signup", label: "Start analyzing" } },
  { name: "Team", price: "₹4,900", note: "per workspace / month", items: ["Up to 10 competitors", "Google Play collection", "Reports with share links", "Optional LLM wording"], cta: { href: "/signup", label: "Start analyzing" } },
  { name: "Enterprise", price: "Custom", note: "Annual agreement", items: ["Unlimited competitors and markets", "Custom aspect taxonomies", "Additional data sources", "Dedicated onboarding"], cta: { href: "#contact", label: "Contact" } },
];

export default async function Landing() {
  const demo = await getPublicDemoPreview();
  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-fg">
              <BarChart3 className="size-3.5" aria-hidden />
            </span>
            RivalSense
          </Link>
          <nav aria-label="Marketing" className="hidden gap-5 text-sm text-fg-muted md:flex">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#capabilities" className="hover:text-fg">Capabilities</a>
            <a href="#methodology" className="hover:text-fg">Methodology</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden text-sm text-fg-muted hover:text-fg sm:inline">
              Sign in
            </Link>
            <Button variant="primary" size="sm" asChild>
              <Link href="/signup">Start analyzing</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-14 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Know what your competitors&apos; customers really think.</h1>
            <p className="mt-4 text-md text-fg-muted text-pretty sm:text-lg">
              RivalSense turns public customer feedback into competitive intelligence — strengths, weaknesses, emerging problems and opportunities across your market.
            </p>
            <div className="mt-8 flex flex-wrap items-start gap-3">
              <Button variant="primary" size="lg" asChild>
                <Link href="/signup">
                  Start analyzing <ArrowRight aria-hidden />
                </Link>
              </Button>
              <ExploreDemoButton size="lg" />
            </div>
            <p className="mt-4 text-xs text-fg-subtle">The demo opens a read-only workspace with synthetic reviews of four fictional quick-commerce apps.</p>
          </div>
        </section>

        {/* Product preview built from real components and demo data */}
        <section aria-labelledby="preview-title" className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="preview-title" className="sr-only">
            Product preview
          </h2>
          <div className="overflow-hidden rounded-lg border border-border-strong bg-bg-subtle shadow-sm">
            <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2 text-xs text-fg-subtle">
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
              </span>
              <span className="ml-2">Overview — {demo?.marketName ?? "Demo market"}</span>
              <Badge tone="warning" className="ml-auto">
                {DEMO_LABEL}
              </Badge>
            </div>
            {demo ? (
              <div className="grid gap-4 p-4 lg:grid-cols-[1.6fr_1fr]">
                <div className="min-w-0 rounded-lg border border-border bg-bg">
                  <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Competitive health · {demo.windowLabel.toLowerCase()}</div>
                  <HealthTable rows={demo.health} range="6m" />
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-bg p-4">
                  <p className="text-sm font-semibold">Top customer drivers</p>
                  <ul className="mt-3 space-y-2.5">
                    {demo.drivers.map((d) => (
                      <li key={d.aspect.id} className="grid grid-cols-[8rem_3rem_1fr] items-center gap-2 text-xs">
                        <span className="truncate">{d.aspect.label}</span>
                        <span className="text-right text-fg-muted tabular">{fmtPct(d.shareOfVoice, 0)}</span>
                        <SentimentSplit pos={d.pos} neu={d.neu} neg={d.neg} />
                      </li>
                    ))}
                  </ul>
                  {demo.emerging && (
                    <p className="mt-4 flex gap-2 rounded-md border border-warning-border bg-warning-bg px-2.5 py-2 text-xs">
                      <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
                      <span>
                        Emerging issue: {demo.emerging.competitor} · {demo.emerging.aspect} — {fmtPct(demo.emerging.prev, 1)} → {fmtPct(demo.emerging.recent, 1)} of reviews,
                        p {demo.emerging.p < 0.001 ? "< 0.001" : `= ${demo.emerging.p.toFixed(3)}`}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-fg-muted">Preview unavailable — the demo data has not been loaded on this server yet.</p>
            )}
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-2xl text-fg-muted">Analysis runs as an offline batch pipeline, so dashboards are fast and every number can be traced back to reviews.</p>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.t} className="border-t border-border-strong pt-4">
                <span className="text-xs text-fg-subtle tabular">0{i + 1}</span>
                <h3 className="mt-1 text-md font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Capabilities */}
        <section id="capabilities" aria-labelledby="cap-title" className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="cap-title" className="text-2xl font-semibold tracking-tight">Capabilities</h2>
            <p className="mt-2 max-w-2xl text-fg-muted">Each capability produces evidence-linked findings; try them on the demo market.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map(({ Icon, t, e }) => (
                <li key={t} className="rounded-lg border border-border bg-bg p-5">
                  <Icon className="size-5 text-fg-muted" aria-hidden />
                  <h3 className="mt-3 text-md font-semibold">{t}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{e}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Example report excerpt */}
        <section aria-labelledby="excerpt-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 id="excerpt-title" className="text-2xl font-semibold tracking-tight">Findings you can defend</h2>
              <p className="mt-2 text-fg-muted">
                Every insight is typed. Only observations state numbers as facts; interpretations, opportunities and recommendations are labelled as analytical suggestions and link to the
                reviews behind them. Reports export to PDF with an evidence appendix.
              </p>
              <Link href="#methodology" className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline">
                Read the methodology <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <div className="rounded-lg border border-border bg-bg p-6">
              <p className="flex items-center gap-2 text-xs tracking-wide text-fg-subtle uppercase">
                <FileText className="size-3.5" aria-hidden /> Report excerpt · {DEMO_LABEL}
              </p>
              <ul className="mt-4 space-y-4">
                {(demo?.findings ?? []).map((f, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-2">
                      <InsightTypeBadge type={f.type as InsightTypeKey} />
                      <span className="text-sm font-medium">{f.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">{f.text}</p>
                    {f.type !== "OBSERVATION" && <p className="mt-1 text-xs text-fg-subtle">{SUGGESTION_LABEL}</p>}
                  </li>
                ))}
                {!demo && <li className="text-sm text-fg-subtle">Excerpt appears once the demo data is loaded.</li>}
              </ul>
            </div>
          </div>
        </section>

        {/* Methodology & responsible data use */}
        <section id="methodology" aria-labelledby="method-title" className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="method-title" className="text-2xl font-semibold tracking-tight">Methodology and responsible data use</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <h3 className="flex items-center gap-2 text-md font-semibold">
                  <ShieldCheck className="size-4 text-fg-muted" aria-hidden /> What we collect
                </h3>
                <p className="mt-2 text-sm text-fg-muted">Review text, star rating, date, app version and the source — only what analysis needs. Collection respects rate limits with a small volume cap.</p>
              </div>
              <div>
                <h3 className="text-md font-semibold">What we don&apos;t</h3>
                <p className="mt-2 text-sm text-fg-muted">No reviewer names, profile pictures or user IDs. No CAPTCHA bypassing, proxies or evasion of platform protections.</p>
              </div>
              <div>
                <h3 className="text-md font-semibold">How scores work</h3>
                <p className="mt-2 text-sm text-fg-muted">
                  Score = 50 × (1 + (positive − negative) ÷ mentions), shown only with 30+ mentions, with 95% Wilson intervals. Emerging issues need a two-proportion z-test with p &lt; 0.05.
                </p>
              </div>
              <div>
                <h3 className="text-md font-semibold">Model evaluation</h3>
                <p className="mt-2 text-sm text-fg-muted">
                  {demo?.evaluation?.gold
                    ? `On ${demo.evaluation.gold.n} hand-labelled real reviews: aspect F1 ${demo.evaluation.gold.aspect_micro_f1}, sentiment macro-F1 ${demo.evaluation.gold.overall_macro_f1} (keyword + VADER baseline ${demo.evaluation.gold.baseline_overall_macro_f1}).`
                    : "Evaluated against a hand-labelled gold set of real reviews and a keyword + VADER baseline; results are published with each release."}{" "}
                  Non-English reviews are counted but not yet analysed.
                </p>
              </div>
            </div>
            {demo && (
              <p className="mt-8 text-xs text-fg-subtle tabular">
                The demo market contains {fmtInt(demo.reviewCount)} synthetic reviews; the latest pipeline run analysed {fmtInt(demo.counts.analysed ?? 0)} of them.
              </p>
            )}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 text-fg-muted">Illustrative plans. There is no checkout — start with the free plan or the demo.</p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {TIERS.map((t) => (
              <li key={t.name} className="flex flex-col rounded-lg border border-border bg-bg p-6">
                <h3 className="text-md font-semibold">{t.name}</h3>
                <p className="mt-3">
                  <span className="text-2xl font-semibold">{t.price}</span> <span className="text-sm text-fg-subtle">{t.note}</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-fg-muted">
                  {t.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                      {i}
                    </li>
                  ))}
                </ul>
                <Button variant={t.name === "Team" ? "primary" : "secondary"} className="mt-6" asChild>
                  <Link href={t.cta.href}>{t.cta.label}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer id="contact" className="border-t border-border bg-bg-subtle">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-4">
          <div>
            <p className="font-semibold">RivalSense</p>
            <p className="mt-2 text-fg-muted">Competitive intelligence from public customer reviews.</p>
          </div>
          <div>
            <p className="font-medium">Product</p>
            <ul className="mt-2 space-y-1.5 text-fg-muted">
              <li><a href="#capabilities" className="hover:text-fg">Capabilities</a></li>
              <li><a href="#pricing" className="hover:text-fg">Pricing</a></li>
              <li><Link href="/login" className="hover:text-fg">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Trust</p>
            <ul className="mt-2 space-y-1.5 text-fg-muted">
              <li><a href="#methodology" className="hover:text-fg">Methodology</a></li>
              <li><a href="#methodology" className="hover:text-fg">Responsible data use</a></li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Contact</p>
            <p className="mt-2 text-fg-muted">
              RivalSense is a portfolio project. For enterprise enquiries, reach the author through the project repository.
            </p>
          </div>
        </div>
        <p className="border-t border-border px-4 py-4 text-center text-xs text-fg-subtle">Demo data is synthetic and describes fictional companies.</p>
      </footer>
    </div>
  );
}
