import OpenAI from "openai";
import { inferenceConfig } from "../../config/config.js";
import { LlmError, type LlmAdapter, type LlmOptions } from "./llm-adapter.js";

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
      const stream = await this.client.chat.completions.create(
        {
          model: "default", // OpenCode Zen ignores model name; uses its configured backend
          max_tokens: 256,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: opts?.abortSignal }
      );

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    } catch (err) {
      if (opts?.abortSignal?.aborted) return;
      throw new LlmError("OpenCode Zen stream failed", err);
    }
  }
}
