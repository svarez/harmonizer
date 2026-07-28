import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PitchDetectorService } from '../pitch/PitchDetectorService';

import type {
  MicrophoneStatus,
  PitchSample,
} from '../types';

interface UsePitchDetectionOptions {
  onVisualSample?: (sample: PitchSample) => void;
}

export function usePitchDetection(
  onSample: (sample: PitchSample) => void,
  options: UsePitchDetectionOptions = {},
) {
  const serviceRef = useRef(
    new PitchDetectorService(),
  );

  const callbackRef = useRef(onSample);
  const visualCallbackRef = useRef(
    options.onVisualSample,
  );
  const lastUiUpdateRef = useRef(0);

  const [status, setStatus] =
    useState<MicrophoneStatus>('idle');

  const [sample, setSample] =
    useState<PitchSample | null>(null);

  const [error, setError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    callbackRef.current = onSample;
  }, [onSample]);

  useEffect(() => {
    visualCallbackRef.current =
      options.onVisualSample;
  }, [options.onVisualSample]);

  useEffect(() => {
    const service = serviceRef.current;

    return () => {
      void service.stop();
    };
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    setError(null);

    try {
      await serviceRef.current.start(
        (newSample) => {
          callbackRef.current(newSample);
          visualCallbackRef.current?.(newSample);

          /*
           * Scoring receives every sample.
           * The canvas receives every sample by ref.
           * React updates about 10 times per second
           * to avoid unnecessary renders.
           */
          const now = performance.now();

          if (now - lastUiUpdateRef.current >= 100) {
            lastUiUpdateRef.current = now;
            setSample(newSample);
          }
        },
      );

      setStatus('running');
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not turn on the microphone';

      setError(message);
      setStatus('error');
    }
  }, []);

  const stop = useCallback(async () => {
    await serviceRef.current.stop();

    setStatus('idle');
    setSample(null);
  }, []);

  return {
    status,
    sample,
    error,
    start,
    stop,
  };
}
