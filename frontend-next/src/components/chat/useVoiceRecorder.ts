import { useState, useRef, useCallback, useEffect } from 'react';
import { SECURITY } from './ChatSecurity';
import { playSound } from './ChatSound';

const getVoiceSupport = () => {
  return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
};

interface UseVoiceRecorderProps {
  onTranscriptionSuccess: (text: string) => void;
  onTranscriptionError: (errorMsg: string) => void;
  onTranscriptionStart: () => void;
  onListeningChange?: (isListening: boolean) => void;
}

export const useVoiceRecorder = ({
  onTranscriptionSuccess,
  onTranscriptionError,
  onTranscriptionStart,
  onListeningChange,
}: UseVoiceRecorderProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceSupported] = useState(getVoiceSupport);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Notify listener on change
  useEffect(() => {
    if (onListeningChange) {
      onListeningChange(isListening);
    }
  }, [isListening, onListeningChange]);

  const handleVoiceToggle = useCallback(async () => {
    if (!voiceSupported) return;

    if (isListening) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      return;
    }

    // Request microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Choose best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size < 100) {
          // Too short — no audio captured
          return;
        }

        // Convert to base64 and send to Gemini for transcription
        setIsTranscribing(true);
        onTranscriptionStart();

        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          // Call Gemini directly from frontend (same pattern as chat fallback)
          let transcribedText = '';
          const clientKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

          if (clientKey) {
            // Direct client-side call to Gemini multimodal API
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inlineData: { mimeType, data: base64 } },
                    { text: 'Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. If silent, return empty string.' },
                  ],
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
              }),
            });
            if (geminiRes.ok) {
              const data = await geminiRes.json();
              transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            } else {
              throw new Error(`Gemini API: ${geminiRes.status}`);
            }
          } else {
            // Fallback: try server endpoint
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64, mimeType }),
            });
            if (!response.ok) throw new Error(`Server: ${response.status}`);
            const { text } = await response.json();
            transcribedText = text || '';
          }

          if (transcribedText && transcribedText.trim()) {
            onTranscriptionSuccess(transcribedText.trim());
          } else {
            onTranscriptionError(' No speech detected. Click the mic and speak clearly.');
          }
        } catch (err) {
          console.error(' Transcription error:', err);
          onTranscriptionError(' Could not transcribe audio. Please try again.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      playSound('send');

      // Security: max 30 seconds recording (anti-DoS)
      voiceTimeoutRef.current = setTimeout(() => {
        recorder.stop();
        setIsListening(false);
        voiceTimeoutRef.current = null;
      }, SECURITY.MAX_VOICE_DURATION_MS);

    } catch (err) {
      console.error(' Microphone error:', err);
      setIsListening(false);
      const errMsg = (err as Error).message || '';
      onTranscriptionError(
        errMsg.includes('Permission')
          ? ' Microphone access denied. Please allow mic permissions in your browser settings.'
          : ' Could not access microphone. Please check your device.'
      );
    }
  }, [voiceSupported, isListening, onTranscriptionStart, onTranscriptionSuccess, onTranscriptionError]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    voiceSupported,
    handleVoiceToggle,
  };
};
