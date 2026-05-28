import OpenAI from "openai";
import { inferenceConfig } from "../../config/config.js";
import { LlmError, type LlmAdapter, type LlmOptions } from "./llm-adapter.js";

/**
 * OpenCode Zen adapter targeting the Responses API surface
 * (https://opencode.ai/zen/v1/responses).
 *
 * The OpenAI SDK exposes Responses via `client.responses.create({ stream: true })`
 * which resolves to a `Stream<ResponseStreamEvent>` — an async iterable of typed
 * events. We translate text-delta events into plain string chunks so the
 * `LlmAdapter` contract (AsyncIterable<string>) stays provider-agnostic.
 */
export class OpenCodeZenAdapter implements LlmAdapter {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: inferenceConfig.OPENCODE_ZEN_API_KEY || "dev",
      baseURL: inferenceConfig.OPENCODE_ZEN_BASE_URL,
    });
  }

  async *streamGenerate(
    systemPrompt: string,
    userPrompt: string,
    opts?: LlmOptions
  ): AsyncIterable<string> {
    try {
      const stream = await this.client.responses.create(
        {
          model: inferenceConfig.OPENCODE_ZEN_MODEL,
          instructions: systemPrompt,
          input: userPrompt,
          max_output_tokens: 256, // 3 lines never need more than 256 tokens
          stream: true,
        },
        { signal: opts?.abortSignal }
      );

      for await (const event of stream) {
        // Only yield on text-delta events. Other events (response.created,
        // response.completed, tool-call deltas, etc.) are intentionally ignored.
        if (event.type === "response.output_text.delta" && event.delta) {
          yield event.delta;
        }
      }
    } catch (err) {
      if (opts?.abortSignal?.aborted) return; // clean abort — not an error
      throw new LlmError("OpenCode Zen stream failed", err);
    }
  }
}
