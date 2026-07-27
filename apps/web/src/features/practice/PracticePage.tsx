import {
  Alert,
  Button,
  Container,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  useMemo,
  useState,
} from 'react';

import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMidiPlayback } from './hooks/useMidiPlayback';
import { usePracticeSession } from './hooks/usePracticeSession';
import { MIN_RELIABLE_PITCH_CLARITY } from './musicUtils';

import { PianoRollCanvas } from './components/PianoRollCanvas';
import { PlayerControls } from './components/PlayerControls';
import { LivePitchIndicator } from './components/LivePitchIndicator';
import { ResultsPanel } from './components/ResultsPanel';

interface PracticePageProps {
  song: Song;
  track: SongTrack;
  onBack: () => void;
}

type PlaybackSource = 'mp3' | 'midi';

export function PracticePage({
  song,
  track,
  onBack,
}: PracticePageProps) {
  const [midiOffsetMs, setMidiOffsetMs] =
    useState(song.midiOffsetMs);

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

  const practiceSession = usePracticeSession({
    getAudioElement,
    notes: track.notes,
    scoringConfig,
    midiOffsetMs,
    latencyCompensationMs,
  });

  const midiPlayback = useMidiPlayback({
    enabled: playbackSource === 'midi',
    isPlaying,
    notes: track.notes,
    getCurrentTime,
    midiOffsetMs,
  });

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

  const handleBack =
    async (): Promise<void> => {
      pause();

      await practiceSession.stopMicrophone();

      onBack();
    };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Button
            variant="subtle"
            onClick={() => {
              void handleBack();
            }}
            mb="md"
          >
            ← Cambiar de pista
          </Button>

          <Text
            size="sm"
            fw={700}
            c="indigo.3"
            tt="uppercase"
          >
            Harmonizer
          </Text>

          <Title order={1}>
            {song.title}
          </Title>

          <Text c="dimmed" mt={4}>
            {song.artist ||
              'Artista desconocido'}
            {' · '}
            {track.name}
          </Text>
        </div>

        <Paper
          withBorder
          radius="lg"
          p="md"
        >
          <PianoRollCanvas
            notes={track.notes}
            minMidi={track.minMidi}
            maxMidi={track.maxMidi}
            getAudioCurrentTime={
              getCurrentTime
            }
            resultsByNoteId={
              practiceSession.resultsByNoteId
            }
            midiOffsetMs={midiOffsetMs}
            livePitchSample={
              practiceSession.pitchSample
            }
          />
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

        <SimpleGrid
          cols={{
            base: 1,
            md: 2,
          }}
        >
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
            withBorder
            radius="md"
            p="lg"
          >
            <Stack>
              <Title order={4}>
                Configuración
              </Title>

              <NumberInput
                label="Offset MIDI respecto al MP3"
                description="Un valor positivo retrasa las notas MIDI"
                value={midiOffsetMs}
                onChange={(value) => {
                  setMidiOffsetMs(
                    Number(value) || 0,
                  );
                }}
                min={-5000}
                max={5000}
                step={10}
              />

              <NumberInput
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
              />

              <NumberInput
                label="Tolerancia de afinación"
                description="50 cents equivalen a medio semitono"
                value={pitchToleranceCents}
                onChange={(value) => {
                  setPitchToleranceCents(
                    Number(value) || 50,
                  );
                }}
                min={10}
                max={100}
                step={5}
              />

              <Alert color="blue">
                Utiliza auriculares para evitar
                que el micrófono detecte el
                propio MP3.
              </Alert>
            </Stack>
          </Paper>
        </SimpleGrid>

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
