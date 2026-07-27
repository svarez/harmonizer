-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "audioPath" TEXT NOT NULL,
    "midiPath" TEXT NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "midiOffsetMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "instrument" TEXT,
    "minMidi" INTEGER NOT NULL,
    "maxMidi" INTEGER NOT NULL,
    "notes" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Track_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "globalAccuracy" REAL NOT NULL,
    "pitchAccuracy" REAL NOT NULL,
    "rhythmAccuracy" REAL NOT NULL,
    "correctNotes" INTEGER NOT NULL,
    "incorrectNotes" INTEGER NOT NULL,
    "evaluatedNotes" INTEGER NOT NULL,
    "latencyCompensationMs" INTEGER NOT NULL,
    "pitchToleranceCents" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSession_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Track_songId_idx" ON "Track"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_songId_position_key" ON "Track"("songId", "position");

-- CreateIndex
CREATE INDEX "PracticeSession_songId_idx" ON "PracticeSession"("songId");

-- CreateIndex
CREATE INDEX "PracticeSession_trackId_idx" ON "PracticeSession"("trackId");

-- CreateIndex
CREATE INDEX "PracticeSession_createdAt_idx" ON "PracticeSession"("createdAt");
