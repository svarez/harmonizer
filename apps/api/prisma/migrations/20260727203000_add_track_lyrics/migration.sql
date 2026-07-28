-- Store synchronized lyrics per vocal track while keeping Song.lyrics as the main fallback.
ALTER TABLE "Song" ADD COLUMN "lyricsByTrackId" JSONB NOT NULL DEFAULT '{}';
