import {
  PitchDetector as PitchyDetector,
} from 'pitchy';

import {
  centsFromNearestMidiNote,
  frequencyToMidi,
  MIN_RELIABLE_PITCH_CLARITY,
  midiToNoteName,
} from '../musicUtils';

import type { PitchSample } from '../types';

type PitchCallback = (sample: PitchSample) => void;

function calculateRootMeanSquare(
  samples: Float32Array<ArrayBuffer>,
): number {
  let sum = 0;

  for (
    let sampleIndex = 0;
    sampleIndex < samples.length;
    sampleIndex += 1
  ) {
    sum += samples[sampleIndex] ** 2;
  }

  return Math.sqrt(sum / samples.length);
}

function normalizeIntensity(
  rootMeanSquare: number,
): number {
  return Math.min(
    Math.max(rootMeanSquare / 0.14, 0),
    1,
  );
}

export class PitchDetectorService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  private animationFrameId: number | null = null;

  private detector:
    | ReturnType<typeof PitchyDetector.forFloat32Array>
    | null = null;

  private inputBuffer: Float32Array<ArrayBuffer> | null =
    null;

  async start(onPitch: PitchCallback): Promise<void> {
    if (this.audioContext) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'El navegador no permite acceder al micrófono',
      );
    }

    this.stream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

    this.audioContext = new AudioContext();
    await this.audioContext.resume();

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;

    this.source =
      this.audioContext.createMediaStreamSource(
        this.stream,
      );

    this.source.connect(this.analyser);

    this.detector =
      PitchyDetector.forFloat32Array(
        this.analyser.fftSize,
      );

    this.inputBuffer = new Float32Array(
      this.analyser.fftSize,
    );

    const analyse = () => {
      if (
        !this.audioContext ||
        !this.analyser ||
        !this.detector ||
        !this.inputBuffer
      ) {
        return;
      }

      this.analyser.getFloatTimeDomainData(
        this.inputBuffer,
      );

      const intensity = normalizeIntensity(
        calculateRootMeanSquare(this.inputBuffer),
      );

      const [frequency, clarity] =
        this.detector.findPitch(
          this.inputBuffer,
          this.audioContext.sampleRate,
        );

      const isUsableFrequency =
        Number.isFinite(frequency) &&
        frequency >= 50 &&
        frequency <= 2000 &&
        clarity >= MIN_RELIABLE_PITCH_CLARITY;

      if (!isUsableFrequency) {
        onPitch({
          timestampMs: performance.now(),
          frequency: null,
          detectedMidi: null,
          noteName: null,
          clarity,
          intensity,
          centsFromNearestNote: null,
        });
      } else {
        const detectedMidi =
          frequencyToMidi(frequency);

        onPitch({
          timestampMs: performance.now(),
          frequency,
          detectedMidi,
          noteName: midiToNoteName(detectedMidi),
          clarity,
          intensity,
          centsFromNearestNote:
            centsFromNearestMidiNote(detectedMidi),
        });
      }

      this.animationFrameId =
        requestAnimationFrame(analyse);
    };

    analyse();
  }

  async stop(): Promise<void> {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.source?.disconnect();
    this.analyser?.disconnect();

    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });

    if (this.audioContext) {
      await this.audioContext.close();
    }

    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.detector = null;
    this.inputBuffer = null;
  }
}
