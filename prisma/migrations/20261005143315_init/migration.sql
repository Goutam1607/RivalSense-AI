-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MarketDataKind" AS ENUM ('DEMO_SYNTHETIC', 'LIVE');

-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('DEMO', 'CSV', 'GOOGLE_PLAY');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ANALYSED', 'NOT_ANALYSED_LANGUAGE', 'DUPLICATE', 'SPAM');

-- CreateEnum
CREATE TYPE "DetectionLayer" AS ENUM ('LEXICON', 'EMBEDDING', 'BOTH');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PeriodGrain" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "ConfidenceLabel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('TIME_WINDOW', 'APP_VERSION');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('OBSERVATION', 'INTERPRETATION', 'OPPORTUNITY', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('EMERGING_ISSUE', 'VERSION_DROP', 'COMPETITIVE_GAP', 'MARKET_WEAKNESS', 'STRENGTH', 'WEAKNESS', 'TOPIC');

-- CreateEnum
CREATE TYPE "ImpactLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "data_kind" "MarketDataKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspect_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "seed_keywords" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "aspect_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "CompetitorStatus" NOT NULL DEFAULT 'ACTIVE',
    "color_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID NOT NULL,
    "kind" "DataSourceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "external_id" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_collected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "external_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "clean_text" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "app_version" TEXT,
    "language" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "content_hash" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "provider" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "models" JSONB NOT NULL DEFAULT '{}',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "eval_summary" JSONB,
    "error" TEXT,

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sentiment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "analysis_run_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "label" "Sentiment" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "positive" DOUBLE PRECISION NOT NULL,
    "neutral" DOUBLE PRECISION NOT NULL,
    "negative" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "review_sentiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_clause" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "analysis_run_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "char_start" INTEGER NOT NULL,
    "char_end" INTEGER NOT NULL,
    "sentiment" "Sentiment",
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "review_clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspect_mention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "clause_id" UUID,
    "analysis_run_id" UUID NOT NULL,
    "aspect_category_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "layer" "DetectionLayer" NOT NULL,
    "matched_text" TEXT,
    "match_start" INTEGER,
    "match_end" INTEGER,
    "similarity" DOUBLE PRECISION,

    CONSTRAINT "aspect_mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspect_aggregate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "aspect_category_id" UUID NOT NULL,
    "grain" "PeriodGrain" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "mentions" INTEGER NOT NULL,
    "positive" INTEGER NOT NULL,
    "neutral" INTEGER NOT NULL,
    "negative" INTEGER NOT NULL,
    "review_count" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "pos_low" DOUBLE PRECISION NOT NULL,
    "pos_high" DOUBLE PRECISION NOT NULL,
    "neg_low" DOUBLE PRECISION NOT NULL,
    "neg_high" DOUBLE PRECISION NOT NULL,
    "confidence" "ConfidenceLabel",
    "share_of_voice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "aspect_aggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emerging_issue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "aspect_category_id" UUID NOT NULL,
    "kind" "FindingKind" NOT NULL,
    "app_version" TEXT,
    "recent_start" TIMESTAMP(3) NOT NULL,
    "recent_end" TIMESTAMP(3) NOT NULL,
    "prev_start" TIMESTAMP(3) NOT NULL,
    "prev_end" TIMESTAMP(3) NOT NULL,
    "recent_negative" INTEGER NOT NULL,
    "recent_total" INTEGER NOT NULL,
    "prev_negative" INTEGER NOT NULL,
    "prev_total" INTEGER NOT NULL,
    "recent_share" DOUBLE PRECISION NOT NULL,
    "prev_share" DOUBLE PRECISION NOT NULL,
    "relative_increase" DOUBLE PRECISION NOT NULL,
    "z_statistic" DOUBLE PRECISION NOT NULL,
    "p_value" DOUBLE PRECISION NOT NULL,
    "evidence_review_ids" TEXT[],
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emerging_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" TEXT[],
    "size" INTEGER NOT NULL,
    "is_uncategorised" BOOLEAN NOT NULL DEFAULT true,
    "nearest_aspect_key" TEXT,
    "example_review_ids" TEXT[],

    CONSTRAINT "topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "clause_id" UUID,
    "competitor_id" UUID NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "competitor_id" UUID,
    "aspect_category_id" UUID,
    "parent_id" UUID,
    "type" "InsightType" NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rewritten_statement" TEXT,
    "written_by" TEXT NOT NULL DEFAULT 'template',
    "facts" JSONB NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "date_from" TIMESTAMP(3) NOT NULL,
    "date_to" TIMESTAMP(3) NOT NULL,
    "sources" TEXT[],
    "confidence" "ConfidenceLabel" NOT NULL,
    "impact" "ImpactLevel" NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggested_investigation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_evidence" (
    "insight_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,

    CONSTRAINT "insight_evidence_pkey" PRIMARY KEY ("insight_id","review_id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "analysis_run_id" UUID,
    "created_by_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATING',
    "config" JSONB NOT NULL,
    "snapshot" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");

-- CreateIndex
CREATE INDEX "membership_workspace_id_idx" ON "membership"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_user_id_workspace_id_key" ON "membership"("user_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_workspace_id_slug_key" ON "market"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "aspect_category_market_id_key_key" ON "aspect_category"("market_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_market_id_slug_key" ON "competitor"("market_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_competitor_id_kind_key" ON "data_source"("competitor_id", "kind");

-- CreateIndex
CREATE INDEX "review_market_id_reviewed_at_id_idx" ON "review"("market_id", "reviewed_at" DESC, "id");

-- CreateIndex
CREATE INDEX "review_competitor_id_reviewed_at_idx" ON "review"("competitor_id", "reviewed_at" DESC);

-- CreateIndex
CREATE INDEX "review_market_id_rating_idx" ON "review"("market_id", "rating");

-- CreateIndex
CREATE INDEX "review_market_id_language_idx" ON "review"("market_id", "language");

-- CreateIndex
CREATE INDEX "review_market_id_status_idx" ON "review"("market_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_data_source_id_external_key_key" ON "review"("data_source_id", "external_key");

-- CreateIndex
CREATE INDEX "analysis_run_market_id_started_at_idx" ON "analysis_run"("market_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "review_sentiment_review_id_key" ON "review_sentiment"("review_id");

-- CreateIndex
CREATE INDEX "review_sentiment_market_id_reviewed_at_idx" ON "review_sentiment"("market_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "review_sentiment_competitor_id_reviewed_at_idx" ON "review_sentiment"("competitor_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_clause_review_id_position_key" ON "review_clause"("review_id", "position");

-- CreateIndex
CREATE INDEX "aspect_mention_market_id_reviewed_at_idx" ON "aspect_mention"("market_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "aspect_mention_competitor_id_aspect_category_id_reviewed_at_idx" ON "aspect_mention"("competitor_id", "aspect_category_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "aspect_mention_aspect_category_id_sentiment_idx" ON "aspect_mention"("aspect_category_id", "sentiment");

-- CreateIndex
CREATE UNIQUE INDEX "aspect_mention_review_id_aspect_category_id_key" ON "aspect_mention"("review_id", "aspect_category_id");

-- CreateIndex
CREATE INDEX "aspect_aggregate_market_id_grain_period_start_idx" ON "aspect_aggregate"("market_id", "grain", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "aspect_aggregate_analysis_run_id_competitor_id_aspect_categ_key" ON "aspect_aggregate"("analysis_run_id", "competitor_id", "aspect_category_id", "grain", "period_start");

-- CreateIndex
CREATE INDEX "emerging_issue_market_id_analysis_run_id_idx" ON "emerging_issue"("market_id", "analysis_run_id");

-- CreateIndex
CREATE INDEX "topic_market_id_analysis_run_id_idx" ON "topic"("market_id", "analysis_run_id");

-- CreateIndex
CREATE INDEX "topic_assignment_topic_id_reviewed_at_idx" ON "topic_assignment"("topic_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "insight_market_id_type_idx" ON "insight"("market_id", "type");

-- CreateIndex
CREATE INDEX "insight_competitor_id_idx" ON "insight"("competitor_id");

-- CreateIndex
CREATE INDEX "insight_evidence_review_id_idx" ON "insight_evidence"("review_id");

-- CreateIndex
CREATE INDEX "report_workspace_id_created_at_idx" ON "report"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_key" ON "share_link"("token");

-- CreateIndex
CREATE INDEX "share_link_report_id_idx" ON "share_link"("report_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market" ADD CONSTRAINT "market_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_category" ADD CONSTRAINT "aspect_category_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor" ADD CONSTRAINT "competitor_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sentiment" ADD CONSTRAINT "review_sentiment_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sentiment" ADD CONSTRAINT "review_sentiment_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_clause" ADD CONSTRAINT "review_clause_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_clause" ADD CONSTRAINT "review_clause_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "review_clause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_aspect_category_id_fkey" FOREIGN KEY ("aspect_category_id") REFERENCES "aspect_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_mention" ADD CONSTRAINT "aspect_mention_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_aggregate" ADD CONSTRAINT "aspect_aggregate_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_aggregate" ADD CONSTRAINT "aspect_aggregate_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_aggregate" ADD CONSTRAINT "aspect_aggregate_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspect_aggregate" ADD CONSTRAINT "aspect_aggregate_aspect_category_id_fkey" FOREIGN KEY ("aspect_category_id") REFERENCES "aspect_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emerging_issue" ADD CONSTRAINT "emerging_issue_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emerging_issue" ADD CONSTRAINT "emerging_issue_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emerging_issue" ADD CONSTRAINT "emerging_issue_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emerging_issue" ADD CONSTRAINT "emerging_issue_aspect_category_id_fkey" FOREIGN KEY ("aspect_category_id") REFERENCES "aspect_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignment" ADD CONSTRAINT "topic_assignment_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignment" ADD CONSTRAINT "topic_assignment_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignment" ADD CONSTRAINT "topic_assignment_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "review_clause"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_aspect_category_id_fkey" FOREIGN KEY ("aspect_category_id") REFERENCES "aspect_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight" ADD CONSTRAINT "insight_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_evidence" ADD CONSTRAINT "insight_evidence_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_evidence" ADD CONSTRAINT "insight_evidence_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
