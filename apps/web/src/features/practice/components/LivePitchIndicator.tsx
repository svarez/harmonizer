import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type {
  MicrophoneStatus,
  PitchSample,
} from '../types';

interface LivePitchIndicatorProps {
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
  idle: 'Desactivado',
  requesting: 'Solicitando permiso',
  running: 'Escuchando',
  error: 'Error',
};

export function LivePitchIndicator({
  status,
  sample,
  error,
  onStart,
  onStop,
}: LivePitchIndicatorProps) {
  const isRunning = status === 'running';

  return (
    <Paper
      className="practice-card practice-microphone"
      radius="lg"
      p="lg"
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={4}>Micrófono</Title>

          <Badge
            color={
              status === 'running'
                ? 'green'
                : status === 'error'
                  ? 'red'
                  : 'gray'
            }
          >
            {STATUS_LABELS[status]}
          </Badge>
        </Group>

        <Group
          className="practice-microphone__hero"
          gap="xl"
          wrap="nowrap"
        >
          <div className="practice-microphone__icon">
            <span />
          </div>

          <Stack gap="sm" className="practice-microphone__copy">
            <Text size="sm" c="dimmed">
              Actívalo para detectar tu afinación
            </Text>

            <Button
              className="practice-button practice-microphone__button"
              variant={isRunning ? 'default' : 'filled'}
              loading={status === 'requesting'}
              onClick={() => {
                if (isRunning) {
                  void onStop();
                } else {
                  void onStart();
                }
              }}
            >
              {isRunning
                ? 'Desactivar micrófono'
                : 'Activar micrófono'}
            </Button>
          </Stack>
        </Group>

        <Group
          className="practice-microphone__stats"
          grow
        >
          <div className="practice-microphone__stat">
            <Text size="xs" c="dimmed">
              Nota detectada
            </Text>
            <Text fw={600}>
              {sample?.noteName ?? '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text size="xs" c="dimmed">
              Frecuencia
            </Text>
            <Text fw={600}>
              {sample?.frequency
                ? `${sample.frequency.toFixed(1)} Hz`
                : '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text size="xs" c="dimmed">
              Claridad
            </Text>
            <Text fw={600}>
              {sample
                ? `${Math.round(sample.clarity * 100)} %`
                : '—'}
            </Text>
          </div>

          <div className="practice-microphone__stat">
            <Text size="xs" c="dimmed">
              Desviación
            </Text>
            <Text fw={600}>
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
          <Text>OCTAVA VOCAL AUTOMÁTICA</Text>
          <Text>0</Text>
          <Text>•</Text>
          <Text>E3 - A4</Text>
          <Text>ⓘ</Text>
        </Group>
      </Stack>
    </Paper>
  );
}
