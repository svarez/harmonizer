import {
  Alert,
  Button,
  Container,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  NoteEvent,
  Song,
} from '@harmonizer/shared';

import { updateSongSynchronization } from '../../api/songsApi';
import { formatTime } from '../practice/musicUtils';

interface SynchronizationPageProps {
  song: Song;
  onBack: (song: Song) => void;
}

interface TimelineCanvasProps {
  notes: NoteEvent[];
  audioPeaks: number[];
  currentTime: number;
  durationSeconds: number;
  midiDurationSeconds: number;
  midiOffsetMs: number;
  midiTimeScale: number;
  pixelsPerSecond: number;
}

const PLAYHEAD_POSITION = 0.38;
const TIME_MARK_INTERVAL_SECONDS = 10;

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

function getAllNotes(song: Song): NoteEvent[] {
  return song.tracks.flatMap(
    (track) => track.notes,
  );
}

function getMidiDurationSeconds(
  notes: NoteEvent[],
  fallbackDurationSeconds: number,
): number {
  return Math.max(
    ...notes.map((note) => note.endSeconds),
    fallbackDurationSeconds,
    0,
  );
}

function TimelineCanvas({
  notes,
  audioPeaks,
  currentTime,
  durationSeconds,
  midiDurationSeconds,
  midiOffsetMs,
  midiTimeScale,
  pixelsPerSecond,
}: TimelineCanvasProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    let animationFrameId = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvasWidth = bounds.width;
      canvasHeight = bounds.height;

      canvas.width = Math.floor(bounds.width * pixelRatio);
      canvas.height = Math.floor(bounds.height * pixelRatio);

      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0,
      );
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    const draw = () => {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = '#111113';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const playheadX = canvasWidth * PLAYHEAD_POSITION;
      const firstVisibleTime =
        currentTime - playheadX / pixelsPerSecond;
      const lastVisibleTime =
        currentTime +
        (canvasWidth - playheadX) / pixelsPerSecond;

      const drawTimeLane = (
        top: number,
        height: number,
      ) => {
        context.fillStyle = '#18181b';
        context.fillRect(0, top, canvasWidth, height);

        const firstMark =
          Math.ceil(
            firstVisibleTime / TIME_MARK_INTERVAL_SECONDS,
          ) * TIME_MARK_INTERVAL_SECONDS;

        context.font = '11px Inter, sans-serif';
        context.textBaseline = 'top';

        for (
          let time = firstMark;
          time <= lastVisibleTime;
          time += TIME_MARK_INTERVAL_SECONDS
        ) {
          if (time < 0) {
            continue;
          }

          const x =
            playheadX +
            (time - currentTime) * pixelsPerSecond;

          context.beginPath();
          context.moveTo(x, top);
          context.lineTo(x, top + height);
          context.strokeStyle = '#3f3f46';
          context.lineWidth = 1;
          context.stroke();

          context.fillStyle = '#a1a1aa';
          context.fillText(
            formatTime(time),
            x + 6,
            top + 8,
          );
        }
      };

      drawTimeLane(0, 42);

      const audioTop = 42;
      const audioHeight = Math.floor(canvasHeight * 0.36);
      const midiTop = audioTop + audioHeight;
      const midiHeight = canvasHeight - midiTop;

      context.fillStyle = '#09090b';
      context.fillRect(0, audioTop, canvasWidth, audioHeight);
      context.fillRect(0, midiTop, canvasWidth, midiHeight);

      context.fillStyle = '#d4d4d8';
      context.font = '12px Inter, sans-serif';
      context.textBaseline = 'top';
      context.fillText('AUDIO', 18, audioTop + 14);
      context.fillText('MIDI', 18, midiTop + 14);

      const waveCenterY = audioTop + audioHeight / 2 + 8;
      const waveMaxHeight = Math.max(audioHeight * 0.34, 12);

      context.strokeStyle = '#22d3ee';
      context.lineWidth = 1;
      context.beginPath();

      for (let x = 0; x < canvasWidth; x += 1) {
        const time =
          firstVisibleTime + x / pixelsPerSecond;
        const peakIndex = Math.floor(
          (time / Math.max(durationSeconds, 1)) *
            audioPeaks.length,
        );
        const peak =
          audioPeaks[peakIndex] ??
          (audioPeaks.length === 0 ? 0.12 : 0);
        const height = peak * waveMaxHeight;

        context.moveTo(x, waveCenterY - height);
        context.lineTo(x, waveCenterY + height);
      }

      context.stroke();

      const minMidi = Math.min(
        ...notes.map((note) => note.midi),
        48,
      );
      const maxMidi = Math.max(
        ...notes.map((note) => note.midi),
        72,
      );
      const pitchCount = Math.max(maxMidi - minMidi + 1, 1);
      const noteTop = midiTop + 44;
      const noteHeight = Math.max(midiHeight - 56, 24);

      context.strokeStyle = '#27272a';
      context.lineWidth = 1;

      for (
        let midi = minMidi;
        midi <= maxMidi;
        midi += 12
      ) {
        const y =
          noteTop +
          ((maxMidi - midi) / pitchCount) * noteHeight;

        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvasWidth, y);
        context.stroke();
      }

      const offsetSeconds = midiOffsetMs / 1000;

      for (const note of notes) {
        const adjustedStart =
          note.startSeconds * midiTimeScale +
          offsetSeconds;
        const adjustedDuration =
          note.durationSeconds * midiTimeScale;
        const x =
          playheadX +
          (adjustedStart - currentTime) * pixelsPerSecond;
        const width = Math.max(
          adjustedDuration * pixelsPerSecond,
          3,
        );

        if (x + width < 0 || x > canvasWidth) {
          continue;
        }

        const y =
          noteTop +
          ((maxMidi - note.midi) / pitchCount) * noteHeight;

        context.fillStyle = '#a78bfa';
        context.beginPath();
        context.roundRect(x, y, width, 8, 3);
        context.fill();
      }

      const midiEnd =
        midiDurationSeconds * midiTimeScale + offsetSeconds;
      const endX =
        playheadX +
        (midiEnd - currentTime) * pixelsPerSecond;

      if (endX >= 0 && endX <= canvasWidth) {
        context.strokeStyle = '#f59e0b';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(endX, midiTop + 8);
        context.lineTo(endX, canvasHeight - 8);
        context.stroke();
      }

      context.strokeStyle = '#facc15';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, canvasHeight);
      context.stroke();

      context.fillStyle = '#facc15';
      context.font = '12px Inter, sans-serif';
      context.fillText(
        `${formatTime(currentTime)} MP3`,
        playheadX + 10,
        48,
      );

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [
    audioPeaks,
    currentTime,
    durationSeconds,
    midiDurationSeconds,
    midiOffsetMs,
    midiTimeScale,
    notes,
    pixelsPerSecond,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: 360,
      }}
    />
  );
}

export function SynchronizationPage({
  song,
  onBack,
}: SynchronizationPageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(
    song.durationSeconds,
  );
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [midiOffsetMs, setMidiOffsetMs] = useState(
    song.midiOffsetMs,
  );
  const [midiTimeScale, setMidiTimeScale] = useState(
    song.midiTimeScale,
  );
  const [zoom, setZoom] = useState(110);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSong, setSavedSong] = useState(song);

  const notes = useMemo(() => getAllNotes(song), [song]);
  const midiDurationSeconds = useMemo(
    () =>
      getMidiDurationSeconds(
        notes,
        song.durationSeconds,
      ),
    [notes, song.durationSeconds],
  );

  const adjustedMidiDurationSeconds =
    midiDurationSeconds * midiTimeScale;
  const adjustedMidiEndSeconds =
    adjustedMidiDurationSeconds + midiOffsetMs / 1000;
  const hasUnsavedChanges =
    midiOffsetMs !== savedSong.midiOffsetMs ||
    midiTimeScale !== savedSong.midiTimeScale;

  useEffect(() => {
    let cancelled = false;

    async function decodeAudio() {
      try {
        const response = await fetch(song.audioUrl);
        const audioBytes = await response.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer =
          await audioContext.decodeAudioData(audioBytes);
        const channelData = audioBuffer.getChannelData(0);
        const bucketCount = 1600;
        const bucketSize = Math.max(
          Math.floor(channelData.length / bucketCount),
          1,
        );
        const peaks: number[] = [];

        for (
          let bucketIndex = 0;
          bucketIndex < bucketCount;
          bucketIndex += 1
        ) {
          let peak = 0;
          const start = bucketIndex * bucketSize;
          const end = Math.min(
            start + bucketSize,
            channelData.length,
          );

          for (
            let sampleIndex = start;
            sampleIndex < end;
            sampleIndex += 1
          ) {
            peak = Math.max(
              peak,
              Math.abs(channelData[sampleIndex]),
            );
          }

          peaks.push(peak);
        }

        await audioContext.close();

        if (!cancelled) {
          setAudioPeaks(peaks);
        }
      } catch {
        if (!cancelled) {
          setAudioPeaks([]);
        }
      }
    }

    void decodeAudio();

    return () => {
      cancelled = true;
    };
  }, [song.audioUrl]);

  const handlePlayPause =
    async (): Promise<void> => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      const updatedSong =
        await updateSongSynchronization(
          song.id,
          {
            midiOffsetMs,
            midiTimeScale,
          },
        );

      setSavedSong(updatedSong);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No se han podido guardar los cambios',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFitEnd = (): void => {
    if (midiDurationSeconds <= 0 || audioDuration <= 0) {
      return;
    }

    const nextScale =
      (audioDuration - midiOffsetMs / 1000) /
      midiDurationSeconds;

    setMidiTimeScale(
      Number(clamp(nextScale, 0.95, 1.05).toFixed(4)),
    );
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Button
              variant="subtle"
              onClick={() => {
                onBack(savedSong);
              }}
              mb="md"
            >
              ← Biblioteca
            </Button>

            <Text
              size="sm"
              fw={700}
              c="indigo.3"
              tt="uppercase"
            >
              Sincronizar
            </Text>

            <Title order={1}>
              {song.title}
            </Title>
          </div>

          <Button
            loading={saving}
            disabled={!hasUnsavedChanges}
            onClick={() => {
              void handleSave();
            }}
          >
            Guardar
          </Button>
        </Group>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
          <TimelineCanvas
            notes={notes}
            audioPeaks={audioPeaks}
            currentTime={currentTime}
            durationSeconds={audioDuration}
            midiDurationSeconds={midiDurationSeconds}
            midiOffsetMs={midiOffsetMs}
            midiTimeScale={midiTimeScale}
            pixelsPerSecond={zoom}
          />
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Slider
              aria-label="Posición de reproducción"
              value={currentTime}
              min={0}
              max={Math.max(audioDuration, 0)}
              step={0.01}
              label={formatTime}
              onChange={(value) => {
                const audio = audioRef.current;

                if (audio) {
                  audio.currentTime = value;
                }

                setCurrentTime(value);
              }}
            />

            <Group justify="space-between">
              <Group>
                <Button
                  variant="default"
                  onClick={() => {
                    const audio = audioRef.current;

                    if (audio) {
                      audio.currentTime = 0;
                    }

                    setCurrentTime(0);
                  }}
                >
                  Reiniciar
                </Button>

                <Button
                  onClick={() => {
                    void handlePlayPause();
                  }}
                >
                  {isPlaying ? 'Pausar' : 'Reproducir'}
                </Button>
              </Group>

              <Text ff="monospace">
                {formatTime(currentTime)} / {formatTime(audioDuration)}
              </Text>
            </Group>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper withBorder radius="md" p="lg">
            <Stack gap="md">
              <Title order={4}>Ajuste MIDI</Title>

              <NumberInput
                label="Desplazamiento MIDI"
                suffix=" ms"
                value={midiOffsetMs}
                onChange={(value) => {
                  setMidiOffsetMs(Number(value) || 0);
                }}
                min={-30000}
                max={30000}
                step={10}
              />

              <NumberInput
                label="Escala temporal"
                value={midiTimeScale}
                onChange={(value) => {
                  setMidiTimeScale(Number(value) || 1);
                }}
                min={0.95}
                max={1.05}
                step={0.0001}
                decimalScale={4}
              />

              <Group grow>
                <Button
                  variant="default"
                  onClick={() => {
                    setMidiOffsetMs(0);
                    setMidiTimeScale(1);
                  }}
                >
                  Restablecer
                </Button>

                <Button
                  variant="light"
                  onClick={handleAutoFitEnd}
                >
                  Ajustar final automáticamente
                </Button>
              </Group>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="lg">
            <Stack gap="md">
              <Title order={4}>Medidas</Title>

              <Group justify="space-between">
                <Text c="dimmed">Zoom</Text>
                <Slider
                  aria-label="Zoom"
                  value={zoom}
                  onChange={setZoom}
                  min={45}
                  max={260}
                  step={5}
                  w={220}
                />
              </Group>

              <Group justify="space-between">
                <Text c="dimmed">Duración MIDI</Text>
                <Text ff="monospace">
                  {adjustedMidiDurationSeconds.toFixed(2)} s
                </Text>
              </Group>

              <Group justify="space-between">
                <Text c="dimmed">Final MIDI ajustado</Text>
                <Text ff="monospace">
                  {adjustedMidiEndSeconds.toFixed(2)} s
                </Text>
              </Group>

              <Group justify="space-between">
                <Text c="dimmed">Duración MP3</Text>
                <Text ff="monospace">
                  {audioDuration.toFixed(2)} s
                </Text>
              </Group>
            </Stack>
          </Paper>
        </SimpleGrid>

        <audio
          ref={audioRef}
          src={song.audioUrl}
          preload="auto"
          onLoadedMetadata={(event) => {
            const nextDuration =
              event.currentTarget.duration;

            if (Number.isFinite(nextDuration)) {
              setAudioDuration(nextDuration);
            }
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(
              event.currentTarget.currentTime,
            );
          }}
          onPlay={() => {
            setIsPlaying(true);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
          }}
        />
      </Stack>
    </Container>
  );
}
