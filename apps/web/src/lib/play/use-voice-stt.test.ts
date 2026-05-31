// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceStt } from "./use-voice-stt";

// --- Mock factory ---
function makeMockRecognition(): ISpeechRecognition {
  return {
    continuous: false,
    interimResults: false,
    lang: "",
    maxAlternatives: 1,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function makeFakeResult(
  transcript: string,
  isFinal: boolean
): SpeechRecognitionResult {
  return {
    isFinal,
    length: 1,
    item: () => ({ transcript, confidence: 0.9 }),
    0: { transcript, confidence: 0.9 },
  } as unknown as SpeechRecognitionResult;
}

function makeFakeEvent(
  results: SpeechRecognitionResult[],
  resultIndex = 0
): SpeechRecognitionEvent {
  return {
    resultIndex,
    results: {
      length: results.length,
      item: (i: number) => results[i] ?? null,
      ...Object.fromEntries(results.map((r, i) => [i, r])),
    },
  } as unknown as SpeechRecognitionEvent;
}

describe("useVoiceStt", () => {
  let mockInstance: ISpeechRecognition;

  // Returning an object from a constructor causes `new` to return that object,
  // so recognition === mockInstance inside the hook and handler assignments land on it.
  const MockCtor = vi.fn(function () {
    return mockInstance;
  });

  beforeEach(() => {
    mockInstance = makeMockRecognition();
    Object.defineProperty(window, "SpeechRecognition", {
      value: MockCtor,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports supported=true when SpeechRecognition is available", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));
    expect(result.current.supported).toBe(true);
  });

  it("reports supported=false when SpeechRecognition is absent", () => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceStt(vi.fn()));
    expect(result.current.supported).toBe(false);
  });

  it("enters pending state immediately on start() before onstart fires", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    expect(result.current.pending).toBe(true);
    expect(result.current.listening).toBe(false);
  });

  it("clears pending and sets listening when onstart fires", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    expect(result.current.pending).toBe(false);
    expect(result.current.listening).toBe(true);
    expect(mockInstance.start).toHaveBeenCalledOnce();
  });

  it("configures recognition with continuous=true, interimResults=true, and maxAlternatives=3", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));
    act(() => { result.current.start(); });
    expect(mockInstance.continuous).toBe(true);
    expect(mockInstance.interimResults).toBe(true);
    expect(mockInstance.maxAlternatives).toBe(3);
  });

  it("commits accumulated finals via onTranscript when onend fires", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStt(onTranscript));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    // Two separate final phrases
    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("where do I go", true)], 0)
      );
    });
    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent(
          [makeFakeResult("where do I go", true), makeFakeResult("after the clock tower", true)],
          1
        )
      );
    });

    // onTranscript not called yet — commit happens on onend
    expect(onTranscript).not.toHaveBeenCalled();

    act(() => { mockInstance.onend?.call(mockInstance); });

    expect(onTranscript).toHaveBeenCalledWith("where do I go after the clock tower");
    expect(result.current.listening).toBe(false);
  });

  it("exposes interim transcript during recognition and clears it on onend", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("how do I", false)], 0)
      );
    });
    expect(result.current.interimTranscript).toBe("how do I");

    act(() => { mockInstance.onend?.call(mockInstance); });
    expect(result.current.interimTranscript).toBe("");
  });

  it("clears interim transcript when a final result replaces it", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("how do I open the door", false)], 0)
      );
    });
    expect(result.current.interimTranscript).toBe("how do I open the door");

    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("how do I open the door", true)], 0)
      );
    });
    expect(result.current.interimTranscript).toBe("");
  });

  it("does not call onTranscript when no speech was captured", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStt(onTranscript));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });
    act(() => { mockInstance.onend?.call(mockInstance); });

    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("recovers clipped interim text appended to finals on onend", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStt(onTranscript));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    // One final phrase, followed by interim that never got finalised before stop().
    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("how do I beat", true)], 0)
      );
    });
    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("the boss", false)], 0)
      );
    });

    // onend fires (e.g. user pressed stop) — interim must be recovered.
    act(() => { mockInstance.onend?.call(mockInstance); });

    expect(onTranscript).toHaveBeenCalledWith("how do I beat the boss");
  });

  it("commits interim-only text when stop fires before any final result", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStt(onTranscript));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    act(() => {
      mockInstance.onresult?.call(
        mockInstance,
        makeFakeEvent([makeFakeResult("open the chest", false)], 0)
      );
    });

    act(() => { mockInstance.onend?.call(mockInstance); });

    expect(onTranscript).toHaveBeenCalledWith("open the chest");
  });

  it("stop() resolves after onend fires", async () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    let resolved = false;
    const stopPromise = result.current.stop().then(() => { resolved = true; });

    expect(resolved).toBe(false);
    act(() => { mockInstance.onend?.call(mockInstance); });

    await stopPromise;
    expect(resolved).toBe(true);
  });

  it("resets pending, listening, and interim on recognition error without calling onTranscript", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStt(onTranscript));

    act(() => { result.current.start(); });
    // Error fires before onstart (e.g. mic permission denied)
    const errorEvent = { error: "not-allowed", message: "" } as SpeechRecognitionErrorEvent;
    act(() => { mockInstance.onerror?.call(mockInstance, errorEvent); });

    expect(result.current.pending).toBe(false);
    expect(result.current.listening).toBe(false);
    expect(result.current.interimTranscript).toBe("");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("calls stop() when start() is pressed while already listening", () => {
    const { result } = renderHook(() => useVoiceStt(vi.fn()));

    act(() => { result.current.start(); });
    act(() => { mockInstance.onstart?.call(mockInstance); });

    act(() => { result.current.start(); }); // second press while listening
    expect(mockInstance.stop).toHaveBeenCalledOnce();
  });

  it("aborts recognition on unmount", () => {
    const { result, unmount } = renderHook(() => useVoiceStt(vi.fn()));
    act(() => { result.current.start(); });
    unmount();
    expect(mockInstance.abort).toHaveBeenCalledOnce();
  });
});
