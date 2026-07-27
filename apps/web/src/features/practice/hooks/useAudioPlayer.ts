import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handlePlay = () => {
      setIsPlaying(true);
      setHasEnded(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setHasEnded(true);
      setCurrentTime(audio.duration || 0);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setCurrentTime(audio.currentTime || 0);
    };

    const handleSeeked = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener(
      'loadedmetadata',
      handleLoadedMetadata,
    );
    audio.addEventListener(
      'durationchange',
      handleLoadedMetadata,
    );
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('seeking', handleSeeked);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener(
        'loadedmetadata',
        handleLoadedMetadata,
      );
      audio.removeEventListener(
        'durationchange',
        handleLoadedMetadata,
      );
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('seeking', handleSeeked);
      audio.removeEventListener(
        'timeupdate',
        handleTimeUpdate,
      );
    };
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    await audio.play();
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const restart = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;

    setCurrentTime(0);
    setHasEnded(false);
    setIsPlaying(false);
  }, []);

  const seek = useCallback((timeSeconds: number) => {
    const audio = audioRef.current;

    if (!audio || !Number.isFinite(timeSeconds)) {
      return;
    }

    const nextTime =
      audio.duration > 0
        ? Math.min(
            Math.max(timeSeconds, 0),
            audio.duration,
          )
        : Math.max(timeSeconds, 0);

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    setHasEnded(false);
  }, []);

  const getAudioElement = useCallback(
    () => audioRef.current,
    [],
  );

  const getCurrentTime = useCallback(
    () => audioRef.current?.currentTime ?? 0,
    [],
  );

  return {
    audioRef,
    isPlaying,
    hasEnded,
    currentTime,
    duration,
    play,
    pause,
    restart,
    seek,
    getAudioElement,
    getCurrentTime,
  };
}
