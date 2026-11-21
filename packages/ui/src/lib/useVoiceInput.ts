import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVoiceInputProps {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (error: unknown) => void;
}

const BAR_COUNT = 24;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const emptyBars = () => Array<number>(BAR_COUNT).fill(0);

interface Recording {
  controller: AbortController;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  audio?: AudioContext;
  frame?: number;
}

export function useVoiceInput({ onResult, onError }: UseVoiceInputProps) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [isSupported, setSupported] = useState(false);
  const [audioVolumes, setAudioVolumes] = useState(emptyBars);
  const active = useRef<Recording | null>(null);
  const callbacks = useRef({ onResult, onError });
  callbacks.current = { onResult, onError };

  const releaseMicrophone = useCallback((recording: Recording) => {
    recording.stream?.getTracks().forEach((track) => track.stop());
    if (recording.frame !== undefined) cancelAnimationFrame(recording.frame);
    if (recording.audio && recording.audio.state !== 'closed') void recording.audio.close().catch(() => undefined);
    recording.frame = undefined;
    recording.audio = undefined;
    recording.stream = undefined;
  }, []);

  const discard = useCallback(() => {
    const recording = active.current;
    active.current = null;
    if (!recording) return;
    recording.controller.abort();
    if (recording.recorder && recording.recorder.state !== 'inactive') recording.recorder.stop();
    releaseMicrophone(recording);
  }, [releaseMicrophone]);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia));
    return discard;
  }, [discard]);

  const cancel = useCallback(() => {
    discard();
    setAudioVolumes(emptyBars());
    setPhase('idle');
  }, [discard]);

  const start = useCallback(async () => {
    if (active.current || !isSupported) return;
    const recording: Recording = { controller: new AbortController() };
    active.current = recording;
    setPhase('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== recording) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recording.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recording.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = ({ data }) => {
        if (active.current !== recording || !data.size) return;
        bytes += data.size;
        if (bytes > MAX_AUDIO_BYTES) {
          cancel();
          callbacks.current.onError?.(new Error('Recording is too large.'));
          return;
        }
        chunks.push(data);
      };
      recorder.onerror = () => {
        if (active.current !== recording) return;
        cancel();
        callbacks.current.onError?.(new Error('Microphone recording failed.'));
      };
      recorder.onstop = async () => {
        releaseMicrophone(recording);
        if (active.current !== recording) return;
        setAudioVolumes(emptyBars());
        setPhase('transcribing');
        try {
          if (!bytes) return;
          const mime = recorder.mimeType || chunks[0]?.type || 'audio/webm';
          const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
          const form = new FormData();
          form.append('file', new Blob(chunks, { type: mime }), `audio.${extension}`);
          const response = await fetch('/api/chat/audio/transcribe', {
            method: 'POST',
            body: form,
            signal: recording.controller.signal,
          });
          if (!response.ok) throw new Error('Audio transcription failed.');
          const result = await response.json();
          if (result.success !== true || typeof result.text !== 'string') throw new Error('Invalid audio transcription.');
          if (active.current === recording && result.text.trim()) callbacks.current.onResult(result.text.trim(), true);
        } catch (error) {
          if (active.current === recording) callbacks.current.onError?.(error);
        } finally {
          if (active.current === recording) {
            active.current = null;
            setPhase('idle');
          }
        }
      };

      if (typeof AudioContext !== 'undefined') {
        const audio = new AudioContext();
        recording.audio = audio;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 256;
        audio.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (active.current !== recording || recorder.state !== 'recording') return;
          analyser.getByteFrequencyData(samples);
          const step = Math.floor(samples.length / BAR_COUNT);
          setAudioVolumes(Array.from({ length: BAR_COUNT }, (_, index) => samples[index * step]));
          recording.frame = requestAnimationFrame(tick);
        };
        recording.frame = requestAnimationFrame(tick);
      }
      recorder.start(1000);
      setPhase('recording');
    } catch (error) {
      if (active.current !== recording) return;
      cancel();
      callbacks.current.onError?.(error);
    }
  }, [cancel, isSupported, releaseMicrophone]);

  const stop = useCallback(() => {
    const recorder = active.current?.recorder;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const toggle = useCallback(() => {
    if (phase === 'recording') stop();
    else if (phase === 'idle') void start();
  }, [phase, start, stop]);

  return { isRecording: phase === 'recording', isTranscribing: phase === 'transcribing', isSupported, audioVolumes, start, stop, cancel, toggle };
}
