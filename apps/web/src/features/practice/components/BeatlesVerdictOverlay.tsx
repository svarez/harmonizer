import {
  Button,
  Text,
} from '@mantine/core';

import type { PracticeSummary } from '../types';

interface BeatlesVerdictOverlayProps {
  summary: PracticeSummary;
  message: string;
  visible: boolean;
  onClose: () => void;
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function BeatlesVerdictOverlay({
  summary,
  message,
  visible,
  onClose,
}: BeatlesVerdictOverlayProps) {
  return (
    <div
      className={`practice-verdict-overlay${
        visible ? ' practice-verdict-overlay--visible' : ''
      }`}
      aria-hidden={!visible}
    >
      <div
        className="practice-verdict"
        role="status"
        aria-live="polite"
      >
        <Button
          className="practice-verdict__close"
          variant="subtle"
          aria-label="Close verdict"
          onClick={onClose}
        >
          x
        </Button>

        <Text className="practice-verdict__score">
          {percentage(summary.globalAccuracy)}
        </Text>

        <Text className="practice-verdict__message">
          {message}
        </Text>
      </div>
    </div>
  );
}
