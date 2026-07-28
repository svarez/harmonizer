import {
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type { PracticeSummary } from '../types';

interface ResultsPanelProps {
  summary: PracticeSummary;
}

function percentage(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function ResultsPanel({
  summary,
}: ResultsPanelProps) {
  return (
    <Paper withBorder radius="md" p="xl">
      <Stack gap="lg">
        <div>
          <Text
            size="sm"
            fw={700}
            c="indigo.3"
            tt="uppercase"
          >
            Session complete
          </Text>

          <Title order={2}>
            Result: {percentage(
              summary.globalAccuracy,
            )}
          </Title>
        </div>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text>Overall accuracy</Text>
            <Text fw={700}>
              {percentage(
                summary.globalAccuracy,
              )}
            </Text>
          </Group>

          <Progress
            value={summary.globalAccuracy * 100}
            size="lg"
          />
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">
              Pitch
            </Text>
            <Text size="xl" fw={700}>
              {percentage(
                summary.pitchAccuracy,
              )}
            </Text>
          </Paper>

          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">
              Rhythm
            </Text>
            <Text size="xl" fw={700}>
              {percentage(
                summary.rhythmAccuracy,
              )}
            </Text>
          </Paper>

          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">
              Correct notes
            </Text>
            <Text size="xl" fw={700}>
              {summary.correctNotes} /{' '}
              {summary.evaluatedNotes}
            </Text>
          </Paper>
        </SimpleGrid>

        <Group>
          <Text c="green">
            Correct: {summary.correctNotes}
          </Text>

          <Text c="red">
            Missed: {summary.incorrectNotes}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
