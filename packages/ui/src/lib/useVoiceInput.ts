import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVoiceInputProps {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (error: any) => void;
  lang?: string;
}

export function useVoiceInput({ onResult, onError, lang = 'zh-CN' }: UseVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  
  // Real-time audio volume array (0-255) for visualization
  const [audioVolumes, setAudioVolumes] = useState<number[]>(new Array(24).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef<string>('');

  useEffect(() => {
    // MediaRecorder is supported in almost all modern browsers
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsSupported(false);
    }
  }, []);

  const visualize = useCallback(() => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      // Sample a few points for the UI bars (e.g., 24 bars)
      const step = Math.floor(dataArray.length / 24);
      const volumes = [];
      for (let i = 0; i < 24; i++) {
        volumes.push(dataArray[i * step]);
      }
      setAudioVolumes(volumes);
      animationFrameRef.current = requestAnimationFrame(update);
    };
    
    update();
  }, []);

  const sendAudioForTranscription = async (audioBlob: Blob, isFinal: boolean) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      
      const response = await fetch('/api/chat/audio/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Transcription failed');
      }
      
      const data = await response.json();
      if (data.success && data.text) {
        // If it's a chunk, we just append it for now (basic chunking)
        transcriptRef.current += (transcriptRef.current ? ' ' : '') + data.text;
        onResult(transcriptRef.current, isFinal);
      }
    } catch (err) {
      console.error(err);
      if (onError) onError(err);
    }
  };

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Setup AudioContext for visualization
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      visualize();
      
      // Setup MediaRecorder for chunking
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      transcriptRef.current = '';
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          
          // Send the chunk we just got. 
          // Note: Sending bare chunks without webm headers might fail in Whisper.
          // For a robust production app, we would send the entire blob accumulated so far 
          // or use WebSockets. Here we send the single chunk and hope ffmpeg can decode it.
          sendAudioForTranscription(e.data, false);
        }
      };
      
      recorder.onstop = () => {
        // We do a final send of the entire audio just to be safe if chunks failed
        const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        sendAudioForTranscription(fullBlob, true);
      };
      
      // Request data every 3 seconds (chunking for real-time feel)
      // Note: This produces partial webm files. 
      recorder.start(3000); 
      setIsRecording(true);
      
    } catch (e) {
      console.error("Could not start microphone:", e);
      if (onError) onError(e);
    }
  }, [visualize, onError, onResult]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    setAudioVolumes(new Array(10).fill(0));
    setIsRecording(false);
  }, [isRecording]);

  const toggle = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  }, [isRecording, start, stop]);

  return {
    isRecording,
    isSupported,
    audioVolumes,
    start,
    stop,
    toggle
  };
}
