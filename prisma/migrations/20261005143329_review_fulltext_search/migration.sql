-- Full-text search for the review explorer (keyword filter).
-- Expression index: Prisma's schema language cannot express it, so it lives in this hand-written migration.
CREATE INDEX IF NOT EXISTS "review_text_fts_idx"
  ON "review" USING GIN (to_tsvector('english', "text"));
