import Anthropic from "@anthropic-ai/sdk";
import { inferenceConfig } from "../../config/config.js";
import { LlmError, type LlmAdapter, type LlmOptions } from "./llm-adapter.js";

const MODEL_ID = "claude-sonnet-4-6";

export class AnthropicAdapter implements LlmAdapter {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: inferenceConfig.ANTHROPIC_API_KEY });
  }

  async *streamGenerate(
    systemPrompt: string,
    userPrompt: string,
    opts?: LlmOptions
  ): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream(
        {
          model: MODEL_ID,
          max_tokens: 256, // 3 lines never need more than 256 tokens
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
        { signal: opts?.abortSignal }
      );

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      if (opts?.abortSignal?.aborted) return; // clean abort — not an error
      throw new LlmError("Anthropic stream failed", err);
    }
  }
}
