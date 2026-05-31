"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseVoiceSttReturn {
  /** Mic is initialising — engine not yet ready. Speak only after this is false and listening is true. */
  pending: boolean;
  listening: boolean;
  supported: boolean;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Push-to-talk Web Speech API hook (continuous mode).
 *
 * - Keeps recording until the user presses stop — prevents premature VAD cutoff.
 * - Finals accumulate in a ref across phrases; committed via `onTranscript` on stop.
 * - Interim text is exposed separately for live preview; never written to the question field.
 * - `maxAlternatives = 3` primes the engine for higher-confidence scoring; index 0 is
 *   always the browser's top-ranked result.
 */
export function useVoiceStt(
  onTranscript: (text: string) => void
): UseVoiceSttReturn {
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const accumulatedRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported =
    typeof window !== "undefined" && getSpeechRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (listening) {
      stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    accumulatedRef.current = "";
    setInterimTranscript("");
    setPending(true);

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setPending(false);
      setListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results.item(i);
        if (!result) continue;
        const best = result.item(0)?.transcript?.trim() ?? "";
        if (result.isFinal) {
          accumulatedRef.current +=
            (accumulatedRef.current ? " " : "") + best;
        } else {
          interim = best;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[useVoiceStt] recognition error:", event.error);
      setPending(false);
      setListening(false);
      setInterimTranscript("");
    };

    // Commit accumulated text when the session ends (user pressed stop, or timeout).
    recognition.onend = () => {
      setPending(false);
      setListening(false);
      setInterimTranscript("");
      const text = accumulatedRef.current.trim();
      if (text) onTranscriptRef.current(text);
      accumulatedRef.current = "";
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [listening, stop]);

  // Abort on unmount to release mic permissions
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { pending, listening, supported, interimTranscript, start, stop };
}
