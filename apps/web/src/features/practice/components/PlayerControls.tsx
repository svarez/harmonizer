import {
  Button,
  Group,
  NumberInput,
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
  audioVolume: number;
  micSensitivity: number;
  playbackRate: number;
  isRepeating: boolean;
  onPlayPause: () => void | Promise<void>;
  onRestart: () => void;
  onSeek: (timeSeconds: number) => void;
  onAudioVolumeChange: (volume: number) => void;
  onMicSensitivityChange: (sensitivity: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onRepeatChange: (isRepeating: boolean) => void;
  onPlaybackSourceChange: (
    source: 'mp3' | 'midi',
  ) => void;
}

export function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  playbackSource,
  audioVolume,
  micSensitivity,
  playbackRate,
  isRepeating,
  onPlayPause,
  onRestart,
  onSeek,
  onAudioVolumeChange,
  onMicSensitivityChange,
  onPlaybackRateChange,
  onRepeatChange,
  onPlaybackSourceChange,
}: PlayerControlsProps) {
  return (
    <Paper
      className="practice-player"
      radius="lg"
      p="sm"
    >
      <Group
        className="practice-player__row"
        justify="space-between"
        wrap="nowrap"
      >
        <Group
          className="practice-player__transport"
          gap="xs"
          wrap="nowrap"
        >
          <Button
            className="practice-button practice-button--secondary"
            variant="default"
            onClick={onRestart}
          >
            Restart
          </Button>

          <Button
            className="practice-button practice-button--secondary practice-button--compact"
            variant="default"
            disabled={duration <= 0}
            onClick={() => {
              onSeek(Math.max(currentTime - 5, 0));
            }}
          >
            -5s
          </Button>

          <Button
            className="practice-button practice-button--play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => {
              void onPlayPause();
            }}
          >
            <span
              className={
                isPlaying
                  ? 'practice-play-icon practice-play-icon--pause'
                  : 'practice-play-icon practice-play-icon--play'
              }
            />
          </Button>

          <Button
            className="practice-button practice-button--secondary practice-button--compact"
            variant="default"
            disabled={duration <= 0}
            onClick={() => {
              onSeek(Math.min(currentTime + 5, duration));
            }}
          >
            +5s
          </Button>
        </Group>

        <Group
          className="practice-player__timeline"
          gap="md"
          wrap="nowrap"
        >
          <Text
            className="practice-player__time"
            ff="monospace"
          >
            <span>{formatTime(currentTime)}</span>
            <span> / </span>
            <span>{formatTime(duration)}</span>
          </Text>

          <Slider
            className="practice-player__slider"
            aria-label="Playback position"
            value={currentTime}
            min={0}
            max={Math.max(duration, 0)}
            step={0.01}
            disabled={duration <= 0}
            label={formatTime}
            onChange={onSeek}
          />
        </Group>

        <Stack
          className="practice-player__source"
          gap={4}
        >
          <Text size="xs" c="dimmed">
            Audio
          </Text>
          <SegmentedControl
            className="practice-source-toggle"
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
        </Stack>

        <Stack
          className="practice-player__mix"
          gap={8}
        >
          <Group gap="sm" wrap="nowrap">
            <Text className="practice-player__mix-icon">
              Vol
            </Text>
            <Slider
              className="practice-player__volume"
              aria-label="MP3 volume"
              value={audioVolume}
              min={0}
              max={100}
              label={null}
              onChange={onAudioVolumeChange}
            />
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text className="practice-player__mix-icon">
              Mic
            </Text>
            <Slider
              className="practice-player__volume practice-player__volume--mic"
              aria-label="Microphone sensitivity"
              value={micSensitivity}
              min={0}
              max={100}
              label={null}
              onChange={onMicSensitivityChange}
            />
          </Group>
        </Stack>

        <Stack className="practice-player__speed" gap={4}>
          <Text size="xs" c="dimmed">
            Speed
          </Text>
          <NumberInput
            className="practice-speed-input"
            value={playbackRate}
            suffix="x"
            decimalScale={2}
            min={0.5}
            max={1.5}
            step={0.05}
            hideControls={false}
            onChange={(value) => {
              onPlaybackRateChange(
                Math.min(
                  Math.max(Number(value) || 1, 0.5),
                  1.5,
                ),
              );
            }}
          />
        </Stack>

        <Stack className="practice-player__repeat" gap={4}>
          <Text size="xs" c="dimmed">
            Repeat
          </Text>
          <Button
            aria-pressed={isRepeating}
            className={`practice-button practice-button--secondary practice-button--icon${
              isRepeating
                ? ' practice-button--active'
                : ''
            }`}
            variant="default"
            onClick={() => {
              onRepeatChange(!isRepeating);
            }}
          >
            ↻
          </Button>
        </Stack>
      </Group>
    </Paper>
  );
}
