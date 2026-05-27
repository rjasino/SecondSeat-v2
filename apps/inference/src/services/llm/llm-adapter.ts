export interface LlmOptions {
  abortSignal?: AbortSignal;
}

/**
 * Provider-agnostic LLM interface. All services consume only this contract —
 * no provider-specific types leak past the adapter boundary.
 */
export interface LlmAdapter {
  streamGenerate(
    systemPrompt: string,
    userPrompt: string,
    opts?: LlmOptions
  ): AsyncIterable<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LlmError";
  }
}
