import {
  Button,
  Checkbox,
  Container,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  NoteEvent,
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMidiPlayback } from './hooks/useMidiPlayback';
import { usePracticeSession } from './hooks/usePracticeSession';
import {
  midiToNoteName,
  MIN_RELIABLE_PITCH_CLARITY,
} from './musicUtils';

import { PianoRollCanvas } from './components/PianoRollCanvas';
import { PlayerControls } from './components/PlayerControls';
import { LivePitchIndicator } from './components/LivePitchIndicator';
import { ResultsPanel } from './components/ResultsPanel';
import type { PitchSample } from './types';

interface PracticePageProps {
  song: Song;
  track: SongTrack;
  onBack: () => void;
}

type PlaybackSource = 'mp3' | 'midi';

const TRACK_COLORS = [
  '#2f7cff',
  '#8b5cf6',
  '#22c1c8',
  '#78c943',
  '#f59e0b',
  '#ec4899',
];

function transposeNotes(
  notes: NoteEvent[],
  semitones: number,
): NoteEvent[] {
  if (semitones === 0) {
    return notes;
  }

  return notes.map((note) => ({
    ...note,
    midi: note.midi + semitones,
  }));
}

function findActiveNote(
  notes: NoteEvent[],
  songTime: number,
): NoteEvent | null {
  return (
    notes.find(
      (note) =>
        songTime >= note.startSeconds &&
        songTime <= note.endSeconds,
    ) ?? null
  );
}

function getTrackPitchRange(
  track: SongTrack,
): { minMidi: number; maxMidi: number } {
  if (track.notes.length === 0) {
    return {
      minMidi: track.minMidi,
      maxMidi: track.maxMidi,
    };
  }

  return track.notes.reduce(
    (range, note) => ({
      minMidi: Math.min(range.minMidi, note.midi),
      maxMidi: Math.max(range.maxMidi, note.midi),
    }),
    {
      minMidi: track.minMidi,
      maxMidi: track.maxMidi,
    },
  );
}

function getDefaultSupportingTrackIds(
  song: Song,
  track: SongTrack,
): string[] {
  const selectedTrackIndex = song.tracks.findIndex(
    (songTrack) => songTrack.id === track.id,
  );

  if (selectedTrackIndex === -1) {
    return song.tracks
      .filter((songTrack) => songTrack.id !== track.id)
      .slice(0, 2)
      .map((songTrack) => songTrack.id);
  }

  return song.tracks
    .map((songTrack, index) => ({
      id: songTrack.id,
      distance: Math.abs(index - selectedTrackIndex),
    }))
    .filter((songTrack) => songTrack.id !== track.id)
    .sort(
      (firstTrack, secondTrack) =>
        firstTrack.distance - secondTrack.distance,
    )
    .slice(0, 2)
    .map((songTrack) => songTrack.id);
}

function getTrackColor(trackIndex: number): string {
  return TRACK_COLORS[trackIndex % TRACK_COLORS.length];
}

function isBlackPianoKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function PracticePage({
  song,
  track,
  onBack,
}: PracticePageProps) {
  const [midiOffsetMs, setMidiOffsetMs] =
    useState(song.midiOffsetMs);

  const [midiTimeScale, setMidiTimeScale] =
    useState(song.midiTimeScale);

  const [
    automaticVocalOctaveShift,
    setAutomaticVocalOctaveShift,
  ] =
    useState(0);

  const octaveShiftVotesRef = useRef<
    Record<number, number>
  >({});
  const livePitchSampleRef =
    useRef<PitchSample | null>(null);
  const lastAutoOctaveSampleTimestampRef =
    useRef<number | null>(null);

  const handleVisualPitchSample = useCallback(
    (sample: PitchSample) => {
      livePitchSampleRef.current = sample;
    },
    [],
  );

  const [
    latencyCompensationMs,
    setLatencyCompensationMs,
  ] = useState(120);

  const [
    pitchToleranceCents,
    setPitchToleranceCents,
  ] = useState(50);

  const [playbackSource, setPlaybackSource] =
    useState<PlaybackSource>('mp3');

  const [
    selectedSupportingTrackIds,
    setSelectedSupportingTrackIds,
  ] = useState<string[]>(() =>
    getDefaultSupportingTrackIds(song, track),
  );

  const player = useAudioPlayer();
  const {
    audioRef,
    currentTime,
    duration,
    getAudioElement,
    getCurrentTime,
    hasEnded,
    isPlaying,
    pause,
    play,
    restart,
    seek,
  } = player;

  const scoringConfig = useMemo(
    () => ({
      pitchToleranceCents,
      minimumClarity: MIN_RELIABLE_PITCH_CLARITY,
      correctNoteThreshold: 0.7,
      onsetToleranceSeconds: 0.35,
      releaseToleranceSeconds: 0.45,
    }),
    [pitchToleranceCents],
  );

  const vocalTransposeSemitones =
    automaticVocalOctaveShift * 12;

  const practiceNotes = useMemo(
    () =>
      transposeNotes(
        track.notes,
        vocalTransposeSemitones,
      ),
    [
      track.notes,
      vocalTransposeSemitones,
    ],
  );

  const practiceMinMidi =
    track.minMidi + vocalTransposeSemitones;

  const practiceMaxMidi =
    track.maxMidi + vocalTransposeSemitones;

  const availableSupportingTracks = useMemo(() => {
    return song.tracks.filter(
      (songTrack) => songTrack.id !== track.id,
    );
  }, [
    song.tracks,
    track.id,
  ]);

  const supportingTracks = useMemo(
    () =>
      availableSupportingTracks.filter((songTrack) =>
        selectedSupportingTrackIds.includes(songTrack.id),
      ),
    [
      availableSupportingTracks,
      selectedSupportingTrackIds,
    ],
  );

  const rollMinMidi = useMemo(
    () =>
      supportingTracks.reduce(
        (lowestMidi, supportingTrack) =>
          Math.min(
            lowestMidi,
            getTrackPitchRange(supportingTrack).minMidi,
          ),
        practiceMinMidi,
      ),
    [
      practiceMinMidi,
      supportingTracks,
    ],
  );

  const rollMaxMidi = useMemo(
    () =>
      supportingTracks.reduce(
        (highestMidi, supportingTrack) =>
          Math.max(
            highestMidi,
            getTrackPitchRange(supportingTrack).maxMidi,
          ),
        practiceMaxMidi,
      ),
    [
      practiceMaxMidi,
      supportingTracks,
    ],
  );

  const pianoKeys = useMemo(
    () =>
      Array.from(
        {
          length: Math.max(rollMaxMidi - rollMinMidi + 1, 1),
        },
        (_, index) => {
          const midi = rollMaxMidi - index;

          return {
            midi,
            name: midiToNoteName(midi),
            isBlack: isBlackPianoKey(midi),
            shouldShowLabel:
              rollMaxMidi - rollMinMidi <= 24 ||
              midi % 12 === 0,
          };
        },
      ),
    [
      rollMaxMidi,
      rollMinMidi,
    ],
  );

  const pianoWhiteKeys = useMemo(
    () => pianoKeys,
    [pianoKeys],
  );

  const pianoBlackKeys = useMemo(
    () => pianoKeys.filter((key) => key.isBlack),
    [pianoKeys],
  );

  const pianoKeyHeightPercent =
    100 / Math.max(pianoKeys.length, 1);

  const practiceSession = usePracticeSession({
    getAudioElement,
    notes: practiceNotes,
    scoringConfig,
    midiOffsetMs,
    midiTimeScale,
    latencyCompensationMs,
    onVisualPitchSample: handleVisualPitchSample,
  });

  const midiPlayback = useMidiPlayback({
    enabled: playbackSource === 'midi',
    isPlaying,
    notes: practiceNotes,
    getCurrentTime,
    midiOffsetMs,
    midiTimeScale,
  });

  const pitchSample =
    practiceSession.pitchSample;
  const resetMidiPlayback =
    midiPlayback.reset;
  const resetPracticeSession =
    practiceSession.reset;

  useEffect(() => {
    if (
      !pitchSample ||
      pitchSample.detectedMidi === null ||
      pitchSample.clarity < MIN_RELIABLE_PITCH_CLARITY ||
      pitchSample.timestampMs ===
        lastAutoOctaveSampleTimestampRef.current
    ) {
      return;
    }

    lastAutoOctaveSampleTimestampRef.current =
      pitchSample.timestampMs;

    const originalMidiTime =
      (currentTime - midiOffsetMs / 1000) /
      midiTimeScale;
    const activeNote = findActiveNote(
      track.notes,
      originalMidiTime,
    );

    if (!activeNote) {
      return;
    }

    const suggestedShift = Math.min(
      Math.max(
        Math.round(
          (pitchSample.detectedMidi - activeNote.midi) / 12,
        ),
        -2,
      ),
      2,
    );

    octaveShiftVotesRef.current[suggestedShift] =
      (octaveShiftVotesRef.current[suggestedShift] ?? 0) + 1;

    const strongestVote = Object.entries(
      octaveShiftVotesRef.current,
    ).sort(
      ([, firstCount], [, secondCount]) =>
        secondCount - firstCount,
    )[0];

    if (!strongestVote) {
      return;
    }

    const [shiftText, voteCount] = strongestVote;
    const nextShift = Number(shiftText);

    if (
      voteCount >= 6 &&
      nextShift !== automaticVocalOctaveShift
    ) {
      setAutomaticVocalOctaveShift(nextShift);
      octaveShiftVotesRef.current = {};
      resetMidiPlayback();
      resetPracticeSession();
    }
  }, [
    automaticVocalOctaveShift,
    currentTime,
    midiOffsetMs,
    midiTimeScale,
    pitchSample,
    resetMidiPlayback,
    resetPracticeSession,
    track.notes,
  ]);

  const handlePlayPause =
    async (): Promise<void> => {
      if (isPlaying) {
        pause();
        return;
      }

      if (
        hasEnded ||
        practiceSession.isFinished
      ) {
        restart();
        midiPlayback.reset();
        practiceSession.reset();
      }

      if (playbackSource === 'midi') {
        await midiPlayback.prepare();
      }

      await play();
    };

  const handleRestart = (): void => {
    restart();
    midiPlayback.reset();
    practiceSession.reset();
  };

  const handlePlaybackSourceChange = (
    source: PlaybackSource,
  ): void => {
    setPlaybackSource(source);
    midiPlayback.reset();

    if (source === 'midi' && isPlaying) {
      void midiPlayback.prepare();
    }
  };

  const handleSupportingTrackToggle = (
    supportingTrackId: string,
    checked: boolean,
  ): void => {
    setSelectedSupportingTrackIds((currentTrackIds) => {
      if (!checked) {
        return currentTrackIds.filter(
          (trackId) => trackId !== supportingTrackId,
        );
      }

      if (currentTrackIds.includes(supportingTrackId)) {
        return currentTrackIds;
      }

      return [
        ...currentTrackIds,
        supportingTrackId,
      ].slice(-2);
    });
  };

  const handleBack =
    async (): Promise<void> => {
      pause();

      await practiceSession.stopMicrophone();

      onBack();
    };

  const trackColorById = useMemo(() => {
    return new Map(
      song.tracks.map((songTrack, index) => [
        songTrack.id,
        getTrackColor(index),
      ]),
    );
  }, [song.tracks]);

  const visibleTrackLegend = useMemo(
    () => [
      track,
      ...supportingTracks,
    ].slice(0, 6),
    [
      supportingTracks,
      track,
    ],
  );

  const coloredSupportingTracks = useMemo(
    () =>
      supportingTracks.map((supportingTrack) => ({
        ...supportingTrack,
        color:
          trackColorById.get(supportingTrack.id) ??
          TRACK_COLORS[1],
      })),
    [
      supportingTracks,
      trackColorById,
    ],
  );

  return (
    <Container
      className="practice-shell"
      size="xl"
      py="md"
    >
      <Stack gap="md">
        <div className="practice-header">
          <div>
            <Button
              className="practice-back"
              variant="subtle"
              onClick={() => {
                void handleBack();
              }}
            >
              ← Cambiar de pista
            </Button>

            <Text
              size="sm"
              fw={700}
              c="indigo.3"
              tt="uppercase"
              className="practice-kicker"
            >
              Harmonizer
            </Text>

            <Title className="practice-title" order={1}>
              {song.title}
            </Title>

            <Text className="practice-subtitle" c="dimmed">
              {song.artist ||
                'Artista desconocido'}
              {' · '}
              {track.name}
            </Text>
          </div>

          <Stack
            className="practice-header__actions"
            gap="lg"
            align="end"
          >
            <Group gap="xs" wrap="nowrap">
              <Button className="practice-save-button">
                Guardar cambios
              </Button>
              <Button
                className="practice-menu-button"
                variant="default"
              >
                ⋮
              </Button>
            </Group>
            <Button
              className="practice-advanced-button"
              variant="default"
            >
              Ajustes avanzados
            </Button>
          </Stack>
        </div>

        <Paper
          className="practice-roll-card"
          radius="lg"
          p="sm"
        >
          <div className="practice-roll-layout">
            <div className="practice-piano-keys">
              {pianoWhiteKeys.map((key) => {
                const rowIndex = rollMaxMidi - key.midi;

                return (
                  <div
                    className="practice-piano-key practice-piano-key--white"
                    key={key.midi}
                    style={{
                      top: `${rowIndex * pianoKeyHeightPercent}%`,
                      height: `${pianoKeyHeightPercent}%`,
                    }}
                  >
                    {!key.isBlack && key.shouldShowLabel && (
                      <Text size="xs">{key.name}</Text>
                    )}
                  </div>
                );
              })}

              {pianoBlackKeys.map((key) => {
                const rowIndex = rollMaxMidi - key.midi;

                return (
                  <div
                    className="practice-piano-key practice-piano-key--black"
                    key={key.midi}
                    style={{
                      top: `${rowIndex * pianoKeyHeightPercent}%`,
                      height: `${pianoKeyHeightPercent}%`,
                    }}
                  />
                );
              })}
            </div>

            <PianoRollCanvas
              notes={practiceNotes}
              supportingTracks={coloredSupportingTracks}
              minMidi={rollMinMidi}
              maxMidi={rollMaxMidi}
              getAudioCurrentTime={
                getCurrentTime
              }
              resultsByNoteId={
                practiceSession.resultsByNoteId
              }
              midiOffsetMs={midiOffsetMs}
              midiTimeScale={midiTimeScale}
              lyrics={song.lyrics}
              livePitchSampleRef={livePitchSampleRef}
              livePitchSample={practiceSession.pitchSample}
            />

            <Stack className="practice-roll-legend" gap="md">
              {visibleTrackLegend.map((legendTrack) => (
                <Group
                  className="practice-roll-legend__item"
                  key={legendTrack.id}
                  gap="sm"
                  wrap="nowrap"
                >
                  <span
                    className="practice-track-dot"
                    style={{
                      backgroundColor:
                        trackColorById.get(legendTrack.id),
                    }}
                  />
                  <div>
                    <Text size="sm" truncate>
                      {legendTrack.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {legendTrack.instrument || 'Lead Vocals'}
                    </Text>
                  </div>
                </Group>
              ))}
            </Stack>
          </div>
        </Paper>

        <PlayerControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          playbackSource={playbackSource}
          onPlayPause={handlePlayPause}
          onRestart={handleRestart}
          onSeek={seek}
          onPlaybackSourceChange={
            handlePlaybackSourceChange
          }
        />

        <div className="practice-lower-grid">
          <LivePitchIndicator
            status={
              practiceSession.microphoneStatus
            }
            sample={
              practiceSession.pitchSample
            }
            error={
              practiceSession.microphoneError
            }
            onStart={
              practiceSession.startMicrophone
            }
            onStop={
              practiceSession.stopMicrophone
            }
          />

          <Paper
            className="practice-card practice-settings"
            radius="md"
            p="lg"
          >
            <div className="practice-settings__grid">
              <Stack gap="md">
                <Title order={4}>
                  Configuración
                </Title>

                {availableSupportingTracks.length > 0 && (
                  <Stack className="practice-settings__section" gap="sm">
                    <div>
                      <Text fw={650} size="sm">
                        Pistas combinadas
                      </Text>

                      <Text size="xs" c="dimmed">
                        La pista principal siempre queda resaltada; puedes sumar hasta dos pistas adicionales.
                      </Text>
                    </div>

                    <Checkbox
                      className="practice-track-option"
                      checked
                      disabled
                      label={
                        <div className="practice-track-label">
                          <Group gap="xs" wrap="nowrap">
                            <span
                              className="practice-track-dot"
                              style={{
                                backgroundColor:
                                  trackColorById.get(track.id),
                              }}
                            />
                            <Text size="sm" truncate>
                              {track.name}
                            </Text>
                            <Text className="practice-track-badge">
                              Principal
                            </Text>
                          </Group>
                        </div>
                      }
                    />

                    {availableSupportingTracks.map(
                      (supportingTrack) => (
                        <Checkbox
                          className="practice-track-option"
                          key={supportingTrack.id}
                          checked={selectedSupportingTrackIds.includes(
                            supportingTrack.id,
                          )}
                          label={
                            <div className="practice-track-label">
                              <Group gap="xs" wrap="nowrap">
                                <span
                                  className="practice-track-dot"
                                  style={{
                                    backgroundColor:
                                      trackColorById.get(supportingTrack.id),
                                  }}
                                />
                                <Text size="sm" truncate>
                                  {supportingTrack.name}
                                </Text>
                                {supportingTrack.instrument && (
                                  <Text
                                    className="practice-track-description"
                                    size="xs"
                                    truncate
                                  >
                                    {supportingTrack.instrument}
                                  </Text>
                                )}
                              </Group>
                            </div>
                          }
                          onChange={(event) => {
                            handleSupportingTrackToggle(
                              supportingTrack.id,
                              event.currentTarget.checked,
                            );
                          }}
                        />
                      ),
                    )}
                  </Stack>
                )}
              </Stack>

              <Stack className="practice-sync-panel" gap="sm">
                <Text className="practice-section-label">
                  SINCRONIZACIÓN
                </Text>

                <div>
                  <Text fw={650} size="sm">
                    Offset MIDI respecto al MP3
                  </Text>
                  <Text size="xs" c="dimmed">
                    Un valor positivo retrasa las notas MIDI
                  </Text>
                </div>

                <Group gap="xs" wrap="nowrap">
                  {[-10, -1, 50, 1, 10].map((offsetStep) => (
                    <Button
                      className="practice-offset-button"
                      key={offsetStep}
                      variant="default"
                      onClick={() => {
                        setMidiOffsetMs(
                          midiOffsetMs + offsetStep,
                        );
                      }}
                    >
                      {offsetStep === 50
                        ? '+50 ms'
                        : offsetStep > 0
                          ? `+${offsetStep}`
                          : offsetStep}
                    </Button>
                  ))}
                </Group>

                <NumberInput
                  className="practice-input"
                  label="Escala temporal MIDI"
                  description="100.00% hace que el MIDI un 0.20 % más largo"
                  value={midiTimeScale * 100}
                  onChange={(value) => {
                    setMidiTimeScale(
                      (Number(value) || 100) / 100,
                    );
                  }}
                  min={95}
                  max={105}
                  step={0.01}
                  decimalScale={2}
                  suffix=" %"
                />

                <NumberInput
                  className="practice-input"
                  label="Compensación del micrófono"
                  description="Corrige la latencia de entrada"
                  value={latencyCompensationMs}
                  onChange={(value) => {
                    setLatencyCompensationMs(
                      Number(value) || 0,
                    );
                  }}
                  min={0}
                  max={1000}
                  step={10}
                  suffix=" ms"
                />

                <NumberInput
                  className="practice-input"
                  label="Tolerancia de afinación"
                  description="Sólo notas; equivale a medio semitono"
                  value={pitchToleranceCents}
                  onChange={(value) => {
                    setPitchToleranceCents(
                      Number(value) || 50,
                    );
                  }}
                  min={10}
                  max={100}
                  step={5}
                  prefix="±"
                  suffix=" cents"
                />
              </Stack>
            </div>
          </Paper>
        </div>

        {practiceSession.isFinished && (
          <ResultsPanel
            summary={
              practiceSession.summary
            }
          />
        )}

        <audio
          ref={audioRef}
          src={song.audioUrl}
          preload="metadata"
          muted={playbackSource === 'midi'}
          onEnded={practiceSession.finish}
        />
      </Stack>
    </Container>
  );
}
