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
    <Paper withBorder radius="md" p="lg">
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

        <div>
          <Text size="sm" c="dimmed">
            Nota detectada
          </Text>

          <Text size="40px" fw={700}>
            {sample?.noteName ?? '—'}
          </Text>
        </div>

        <Group grow>
          <div>
            <Text size="xs" c="dimmed">
              Frecuencia
            </Text>
            <Text fw={600}>
              {sample?.frequency
                ? `${sample.frequency.toFixed(1)} Hz`
                : '—'}
            </Text>
          </div>

          <div>
            <Text size="xs" c="dimmed">
              Claridad
            </Text>
            <Text fw={600}>
              {sample
                ? `${Math.round(sample.clarity * 100)} %`
                : '—'}
            </Text>
          </div>

          <div>
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

        <Button
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
    </Paper>
  );
}