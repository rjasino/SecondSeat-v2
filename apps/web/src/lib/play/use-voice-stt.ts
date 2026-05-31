"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseVoiceSttReturn {
  /** Mic is initialising — engine not yet ready. Speak only after this is false and listening is true. */
  pending: boolean;
  listening: boolean;
  supported: boolean;
  interimTranscript: string;
  start: () => void;
  /** Resolves once the session has fully ended and the transcript has been committed. */
  stop: () => Promise<void>;
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
 * - Interim text is tracked in both state (for live preview) and a ref so that any
 *   in-flight interim captured just before stop() is recovered and appended to the
 *   final transcript — this is what prevents the last syllables being clipped.
 * - `stop()` is async and resolves only after `onend` fires, so callers can
 *   `await stop()` and be sure the transcript callback has already been invoked.
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
  // Mirrors interimTranscript state so onend can recover clipped words.
  const interimRef = useRef("");
  const stopResolveRef = useRef<(() => void) | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported =
    typeof window !== "undefined" && getSpeechRecognitionCtor() !== null;

  const stop = useCallback((): Promise<void> => {
    const recognition = recognitionRef.current;
    if (!recognition) return Promise.resolve();

    return new Promise<void>((resolve) => {
      stopResolveRef.current = resolve;
      recognition.stop();
    });
  }, []);

  const start = useCallback(() => {
    if (listening) {
      void stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    accumulatedRef.current = "";
    interimRef.current = "";
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
          interimRef.current = "";
        } else {
          interim = best;
          interimRef.current = best;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[useVoiceStt] recognition error:", event.error);
      setPending(false);
      setListening(false);
      setInterimTranscript("");
      interimRef.current = "";
      const resolve = stopResolveRef.current;
      stopResolveRef.current = null;
      resolve?.();
    };

    // Commit when the session ends (user pressed stop, or browser VAD timeout).
    // Any interim that hadn't been finalised before stop() is appended here to
    // recover words that would otherwise be clipped.
    recognition.onend = () => {
      setPending(false);
      setListening(false);
      setInterimTranscript("");

      const finals = accumulatedRef.current.trim();
      const tail = interimRef.current.trim();
      const text = finals && tail ? `${finals} ${tail}` : finals || tail;

      accumulatedRef.current = "";
      interimRef.current = "";

      if (text) onTranscriptRef.current(text);

      const resolve = stopResolveRef.current;
      stopResolveRef.current = null;
      resolve?.();
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
