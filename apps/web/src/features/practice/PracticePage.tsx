import {
  Button,
  Container,
  Group,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';

import {
  type CSSProperties,
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
  SyncedLyricWord,
} from '@harmonizer/shared';

import { useAudioPlayer } from './hooks/useAudioPlayer';
import {
  type MidiPlaybackNote,
  useMidiPlayback,
} from './hooks/useMidiPlayback';
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
import { getVocalTracks } from '../vocalTracks';

interface PracticePageProps {
  song: Song;
  track: SongTrack;
  adminAccess?: boolean;
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

const MAIN_MIDI_TRACK_VOLUME = 0.1;
const SUPPORTING_MIDI_TRACK_VOLUME = 0.02;

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

function roundSeconds(seconds: number): number {
  return Number(seconds.toFixed(3));
}

function resynchronizeLyrics(
  lyrics: SyncedLyricWord[],
  previousOffsetMs: number,
  previousTimeScale: number,
  nextOffsetMs: number,
  nextTimeScale: number,
): SyncedLyricWord[] {
  if (
    lyrics.length === 0 ||
    (previousOffsetMs === nextOffsetMs &&
      previousTimeScale === nextTimeScale)
  ) {
    return lyrics;
  }

  const previousOffsetSeconds = previousOffsetMs / 1000;
  const nextOffsetSeconds = nextOffsetMs / 1000;
  const safePreviousTimeScale = previousTimeScale || 1;
  const durationScale =
    nextTimeScale / safePreviousTimeScale;

  return lyrics.map((word) => ({
    ...word,
    startSeconds: roundSeconds(
      Math.max(
        ((word.startSeconds - previousOffsetSeconds) /
          safePreviousTimeScale) *
          nextTimeScale +
          nextOffsetSeconds,
        0,
      ),
    ),
    durationSeconds:
      word.durationSeconds === undefined
        ? undefined
        : roundSeconds(
            Math.max(
              word.durationSeconds * durationScale,
              0.02,
            ),
          ),
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

function getTrackColor(trackIndex: number): string {
  return TRACK_COLORS[trackIndex % TRACK_COLORS.length];
}

function isBlackPianoKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function PracticePage({
  song,
  track,
  adminAccess = false,
  onBack,
}: PracticePageProps) {
  const [activeTrack, setActiveTrack] =
    useState(() => {
      const vocalTracks = getVocalTracks(song);

      return (
        vocalTracks.find(
          (songTrack) => songTrack.id === track.id,
        ) ??
        vocalTracks[0] ??
        track
      );
    });

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
  const rollCardRef = useRef<HTMLDivElement | null>(null);
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
  const [isRollFullscreen, setIsRollFullscreen] =
    useState(false);
  const [audioVolume, setAudioVolume] = useState(70);
  const [micSensitivity, setMicSensitivity] = useState(
    Math.round(MIN_RELIABLE_PITCH_CLARITY * 100),
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isRepeating, setIsRepeating] = useState(false);

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
      minimumClarity: micSensitivity / 100,
      correctNoteThreshold: 0.7,
      onsetToleranceSeconds: 0.35,
      releaseToleranceSeconds: 0.45,
    }),
    [micSensitivity, pitchToleranceCents],
  );

  const vocalTransposeSemitones =
    automaticVocalOctaveShift * 12;

  const practiceNotes = useMemo(
    () =>
      transposeNotes(
        activeTrack.notes,
        vocalTransposeSemitones,
      ),
    [
      activeTrack.notes,
      vocalTransposeSemitones,
    ],
  );

  const visualNotes = activeTrack.notes;

  const vocalTracks = useMemo(
    () => getVocalTracks(song),
    [song],
  );

  const supportingTracks = useMemo(
    () =>
      vocalTracks.filter(
        (songTrack) => songTrack.id !== activeTrack.id,
      ),
    [
      activeTrack.id,
      vocalTracks,
    ],
  );

  const midiPlaybackNotes = useMemo<MidiPlaybackNote[]>(
    () => [
      ...practiceNotes.map((note) => ({
        ...note,
        playbackId: `${activeTrack.id}:${note.id}`,
        volume: MAIN_MIDI_TRACK_VOLUME,
      })),
      ...supportingTracks.flatMap((supportingTrack) =>
        supportingTrack.notes.map((note) => ({
          ...note,
          playbackId: `${supportingTrack.id}:${note.id}`,
          volume: SUPPORTING_MIDI_TRACK_VOLUME,
        })),
      ),
    ],
    [
      activeTrack.id,
      practiceNotes,
      supportingTracks,
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
        getTrackPitchRange(activeTrack).minMidi,
      ),
    [
      activeTrack,
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
        getTrackPitchRange(activeTrack).maxMidi,
      ),
    [
      activeTrack,
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
    notes: midiPlaybackNotes,
    getCurrentTime,
    midiOffsetMs,
    midiTimeScale,
    playbackRate,
  });

  const pitchSample =
    practiceSession.pitchSample;
  const resetMidiPlayback =
    midiPlayback.reset;
  const resetPracticeSession =
    practiceSession.reset;

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume =
      playbackSource === 'mp3' ? audioVolume / 100 : 0;
    audio.playbackRate = playbackRate;
    audio.loop = isRepeating;
  }, [
    audioRef,
    audioVolume,
    isRepeating,
    playbackRate,
    playbackSource,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsRollFullscreen(
        document.fullscreenElement === rollCardRef.current,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        isRollFullscreen &&
        !document.fullscreenElement
      ) {
        setIsRollFullscreen(false);
      }
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    );
    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.toggle(
      'practice-roll-fullscreen-active',
      isRollFullscreen,
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      );
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove(
        'practice-roll-fullscreen-active',
      );
    };
  }, [isRollFullscreen]);

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
      activeTrack.notes,
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
    activeTrack.notes,
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

  const handleToggleRollFullscreen = (): void => {
    const rollCard = rollCardRef.current;

    if (isRollFullscreen) {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        setIsRollFullscreen(false);
      }

      return;
    }

    setIsRollFullscreen(true);
    const fullscreenRequest =
      rollCard?.requestFullscreen?.();

    void fullscreenRequest?.catch(() => {
      setIsRollFullscreen(true);
    });
  };

  const handleMainTrackChange = (
    trackId: string,
  ): void => {
    const nextTrack = song.tracks.find(
      (songTrack) => songTrack.id === trackId,
    );

    if (!nextTrack || nextTrack.id === activeTrack.id) {
      return;
    }

    setActiveTrack(nextTrack);
    setAutomaticVocalOctaveShift(0);
    octaveShiftVotesRef.current = {};
    midiPlayback.reset();
    practiceSession.reset();
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
  const activeLyricsSource =
    song.lyricsByTrackId?.[activeTrack.id] ??
    song.lyrics;
  const activeLyrics = useMemo(
    () =>
      resynchronizeLyrics(
        activeLyricsSource,
        song.midiOffsetMs,
        song.midiTimeScale,
        midiOffsetMs,
        midiTimeScale,
      ),
    [
      activeLyricsSource,
      midiOffsetMs,
      midiTimeScale,
      song.midiOffsetMs,
      song.midiTimeScale,
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
              className="practice-brand-link"
              variant="subtle"
              onClick={() => {
                void handleBack();
              }}
            >
              Harmonizer
            </Button>

            <Title className="practice-title" order={1}>
              {song.title}
            </Title>

            <Text className="practice-subtitle" c="dimmed">
              {song.artist ||
                'Artista desconocido'}
              {' · '}
              {activeTrack.name}
            </Text>
          </div>
          
        </div>

        <div
          className={`practice-roll-stage${
            isRollFullscreen
              ? ' practice-roll-stage--fullscreen'
              : ''
          }`}
          ref={rollCardRef}
        >
          <Paper
            className="practice-roll-card"
            radius="lg"
            p="sm"
          >
            <Tooltip
              label={
                isRollFullscreen
                  ? 'Salir de pantalla completa'
                  : 'Pantalla completa'
              }
              position="left"
            >
              <Button
                aria-label={
                  isRollFullscreen
                    ? 'Salir de pantalla completa'
                    : 'Ver canvas a pantalla completa'
                }
                className="practice-roll-fullscreen-button"
                variant="default"
                onClick={handleToggleRollFullscreen}
              >
                <span
                  className={`practice-roll-fullscreen-icon${
                    isRollFullscreen
                      ? ' practice-roll-fullscreen-icon--exit'
                      : ''
                  }`}
                  aria-hidden="true"
                />
              </Button>
            </Tooltip>

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
                notes={visualNotes}
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
                mainTrackColor={
                  trackColorById.get(activeTrack.id) ??
                  TRACK_COLORS[0]
                }
                lyrics={activeLyrics}
                livePitchSampleRef={livePitchSampleRef}
                livePitchSample={practiceSession.pitchSample}
              />

              <Stack className="practice-roll-legend" gap="sm">
                <Text fw={700} size="sm">
                  Pista principal
                </Text>

                {vocalTracks.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    No se han detectado pistas vocales.
                  </Text>
                ) : (
                  <Radio.Group
                    value={activeTrack.id}
                    onChange={handleMainTrackChange}
                  >
                    <Stack gap="xs">
                      {vocalTracks.map((legendTrack) => (
                        <Radio
                          className="practice-track-option"
                          key={legendTrack.id}
                          style={
                            {
                              '--practice-track-color':
                                trackColorById.get(legendTrack.id) ??
                                TRACK_COLORS[0],
                            } as CSSProperties
                          }
                          value={legendTrack.id}
                          label={
                            <div className="practice-track-label">
                              <Text size="sm">
                                {legendTrack.name}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {legendTrack.instrument || 'Lead Vocals'}
                              </Text>
                            </div>
                          }
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                )}
              </Stack>
            </div>
          </Paper>

          <PlayerControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            playbackSource={playbackSource}
            audioVolume={audioVolume}
            micSensitivity={micSensitivity}
            playbackRate={playbackRate}
            isRepeating={isRepeating}
            onPlayPause={handlePlayPause}
            onRestart={handleRestart}
            onSeek={seek}
            onAudioVolumeChange={setAudioVolume}
            onMicSensitivityChange={setMicSensitivity}
            onPlaybackRateChange={setPlaybackRate}
            onRepeatChange={setIsRepeating}
            onPlaybackSourceChange={
              handlePlaybackSourceChange
            }
          />
        </div>

        <div
          className={`practice-lower-grid${
            adminAccess ? '' : ' practice-lower-grid--public'
          }`}
        >
          <LivePitchIndicator
            wide={!adminAccess}
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

          {adminAccess && (
            <Paper
              className="practice-card practice-settings"
              radius="md"
              p="lg"
            >
              <Stack gap="sm">
                <Title order={4}>
                  Configuración
                </Title>

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
            </Paper>
          )}
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
