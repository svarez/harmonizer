import {
  Button,
  Group,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Text,
} from '@mantine/core';

import { formatTime } from '../musicUtils';

interface PlayerControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSource: 'mp3' | 'midi';
  onPlayPause: () => void | Promise<void>;
  onRestart: () => void;
  onSeek: (timeSeconds: number) => void;
  onPlaybackSourceChange: (
    source: 'mp3' | 'midi',
  ) => void;
}

export function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  playbackSource,
  onPlayPause,
  onRestart,
  onSeek,
  onPlaybackSourceChange,
}: PlayerControlsProps) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Slider
          aria-label="Posición de reproducción"
          value={currentTime}
          min={0}
          max={Math.max(duration, 0)}
          step={0.01}
          disabled={duration <= 0}
          label={formatTime}
          onChange={onSeek}
        />

        <Group justify="space-between">
          <Group>
            <Button
              variant="default"
              onClick={onRestart}
            >
              Reiniciar
            </Button>

            <Button
              onClick={() => {
                void onPlayPause();
              }}
            >
              {isPlaying ? 'Pausar' : 'Reproducir'}
            </Button>
          </Group>

          <SegmentedControl
            value={playbackSource}
            onChange={(value) => {
              onPlaybackSourceChange(
                value as 'mp3' | 'midi',
              );
            }}
            data={[
              {
                label: 'MP3',
                value: 'mp3',
              },
              {
                label: 'MIDI',
                value: 'midi',
              },
            ]}
          />

          <Text ff="monospace">
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
