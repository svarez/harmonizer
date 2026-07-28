import {
  Badge,
  Button,
  Group,
  Paper,
  Text,
  Title,
} from '@mantine/core';

import type {
  MicrophoneStatus,
  PitchSample,
} from '../types';

interface LivePitchIndicatorProps {
  wide?: boolean;
  status: MicrophoneStatus;
  sample: PitchSample | null;
  error: string | null;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
}

const STATUS_LABELS: Record<
  MicrophoneStatus,
  string
> = {
  idle: 'Off',
  requesting: 'Requesting permission',
  running: 'Listening',
  error: 'Error',
};

export function LivePitchIndicator({
  wide = false,
  status,
  sample,
  error,
  onStart,
  onStop,
}: LivePitchIndicatorProps) {
  const isRunning = status === 'running';
  const isRequesting = status === 'requesting';

  const handleToggleMicrophone = (): void => {
    if (isRunning) {
      void onStop();
      return;
    }

    void onStart();
  };

  return (
    <Paper
      className={`practice-card practice-microphone${
        wide ? ' practice-microphone--wide' : ''
      }`}
      radius="lg"
      p="lg"
    >
      <div className="practice-microphone__layout">
        <div className="practice-microphone__intro">
          <Group gap="md" wrap="nowrap">
            <span className="practice-microphone__small-icon" />
            <Title order={4}>Microphone</Title>
            <Badge
              className="practice-microphone__badge"
              color={
                status === 'running'
                  ? 'teal'
                  : status === 'error'
                    ? 'red'
                    : 'gray'
              }
            >
              {STATUS_LABELS[status]}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            Turn it on to detect your pitch
          </Text>

          <Button
            className="practice-button practice-microphone__button"
            variant={isRunning ? 'default' : 'filled'}
            loading={isRequesting}
            onClick={handleToggleMicrophone}
          >
            <span className="practice-microphone__button-icon" />
            {isRunning
              ? 'Turn microphone off'
              : 'Turn microphone on'}
          </Button>
        </div>

        <div className="practice-microphone__hero">
          <div className="practice-microphone__wave" />
          <button
            className="practice-microphone__icon"
            type="button"
            aria-label={
              isRunning
                ? 'Turn microphone off'
                : 'Turn microphone on'
            }
            disabled={isRequesting}
            onClick={handleToggleMicrophone}
          >
            <span />
          </button>
        </div>

        <Group className="practice-microphone__stats" grow>
          <div className="practice-microphone__stat">
            <Text className="practice-microphone__stat-label">
              Detected note
            </Text>
            <Text className="practice-microphone__stat-value">
              {sample?.noteName ?? '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text className="practice-microphone__stat-label">
              Frequency
            </Text>
            <Text className="practice-microphone__stat-value">
              {sample?.frequency
                ? `${sample.frequency.toFixed(1)} Hz`
                : '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text className="practice-microphone__stat-label">
              Clarity
            </Text>
            <Text className="practice-microphone__stat-value">
              {sample
                ? `${Math.round(sample.clarity * 100)} %`
                : '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text className="practice-microphone__stat-label">
              Deviation
            </Text>
            <Text className="practice-microphone__stat-value">
              {sample?.centsFromNearestNote !== null &&
              sample?.centsFromNearestNote !== undefined
                ? `${Math.round(
                    sample.centsFromNearestNote,
                  )} cents`
                : '—'}
            </Text>
          </div>
        </Group>

        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        <Group className="practice-microphone__octave">
          <Text>AUTOMATIC VOCAL OCTAVE</Text>
          <Text>0</Text>
          <Text>•</Text>
          <Text>E3 - A4</Text>
          <Text>ⓘ</Text>
        </Group>
      </div>
    </Paper>
  );
}
