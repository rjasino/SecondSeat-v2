import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock config before importing the adapter ---
vi.mock("../../config/config.js", () => ({
  inferenceConfig: {
    OPENCODE_ZEN_API_KEY: "test-key",
    OPENCODE_ZEN_BASE_URL: "https://opencode.ai/zen/v1",
    OPENCODE_ZEN_MODEL: "opencode/claude-haiku-4-5",
  },
}));

// --- Mock the OpenAI SDK at the boundary ---
// We control what `client.responses.create({ stream: true })` returns so we can
// assert how the adapter translates Responses-API events into text chunks.
const mockResponsesCreate = vi.fn();

vi.mock("openai", () => {
  class FakeOpenAI {
    responses = { create: mockResponsesCreate };
  }
  return { default: FakeOpenAI };
});

import { OpenCodeZenAdapter } from "./opencode-zen.adapter.js";
import { LlmError } from "./llm-adapter.js";

/**
 * Build a fake stream that yields the supplied events in order.
 * Mirrors the shape of the SDK's `Stream<ResponseStreamEvent>` (async iterable).
 */
function fakeStream(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

describe("OpenCodeZenAdapter.streamGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields text deltas in order and ignores non-text events", async () => {
    mockResponsesCreate.mockResolvedValue(
      fakeStream([
        { type: "response.created", response: { id: "r_1" } },
        { type: "response.output_text.delta", delta: "Try the " },
        { type: "response.output_text.delta", delta: "north door." },
        { type: "response.output_text.done", text: "Try the north door." },
        { type: "response.completed", response: { id: "r_1" } },
      ])
    );

    const adapter = new OpenCodeZenAdapter();
    const chunks = await collect(
      adapter.streamGenerate("system policy", "where do I go?")
    );

    expect(chunks).toEqual(["Try the ", "north door."]);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    const [body] = mockResponsesCreate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "opencode/claude-haiku-4-5",
      instructions: "system policy",
      input: [
        { role: "system", content: "system policy" },
        { role: "user", content: "where do I go?" },
      ],
      max_output_tokens: 256,
      stream: true,
    });
  });

  it("skips empty text deltas to avoid noisy downstream chunks", async () => {
    mockResponsesCreate.mockResolvedValue(
      fakeStream([
        { type: "response.output_text.delta", delta: "" },
        { type: "response.output_text.delta", delta: "Hint." },
        { type: "response.output_text.delta", delta: "" },
      ])
    );

    const adapter = new OpenCodeZenAdapter();
    const chunks = await collect(adapter.streamGenerate("sys", "user"));

    expect(chunks).toEqual(["Hint."]);
  });

  it("wraps upstream errors in LlmError", async () => {
    mockResponsesCreate.mockRejectedValue(new Error("upstream 500"));

    const adapter = new OpenCodeZenAdapter();
    await expect(collect(adapter.streamGenerate("s", "u"))).rejects.toBeInstanceOf(
      LlmError
    );
  });

  it("preserves the original error on LlmError.cause", async () => {
    const original = new Error("upstream boom");
    mockResponsesCreate.mockRejectedValue(original);

    const adapter = new OpenCodeZenAdapter();
    try {
      await collect(adapter.streamGenerate("s", "u"));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).cause).toBe(original);
      expect((err as LlmError).message).toBe("OpenCode Zen stream failed");
    }
  });

  it("returns cleanly without throwing when the abort signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    mockResponsesCreate.mockRejectedValue(new Error("aborted"));

    const adapter = new OpenCodeZenAdapter();
    const chunks = await collect(
      adapter.streamGenerate("s", "u", { abortSignal: controller.signal })
    );

    expect(chunks).toEqual([]);
  });

  it("forwards the abort signal to the SDK call", async () => {
    mockResponsesCreate.mockResolvedValue(fakeStream([]));

    const controller = new AbortController();
    const adapter = new OpenCodeZenAdapter();
    await collect(
      adapter.streamGenerate("s", "u", { abortSignal: controller.signal })
    );

    const [, opts] = mockResponsesCreate.mock.calls[0]!;
    expect(opts).toMatchObject({ signal: controller.signal });
  });
});
