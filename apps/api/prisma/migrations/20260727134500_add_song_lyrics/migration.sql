-- Store synchronized lyrics as timed phrase events.
ALTER TABLE "Song" ADD COLUMN "lyrics" JSONB NOT NULL DEFAULT '[]';
