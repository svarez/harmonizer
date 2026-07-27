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

export function usePitchDetection(
  onSample: (sample: PitchSample) => void,
) {
  const serviceRef = useRef(
    new PitchDetectorService(),
  );

  const callbackRef = useRef(onSample);
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
    return () => {
      void serviceRef.current.stop();
    };
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    setError(null);

    try {
      await serviceRef.current.start(
        (newSample) => {
          callbackRef.current(newSample);

          /*
           * La puntuación recibe todas las muestras.
           * La interfaz se actualiza solo unas 10 veces
           * por segundo para no renderizar innecesariamente.
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
          : 'No se ha podido activar el micrófono';

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