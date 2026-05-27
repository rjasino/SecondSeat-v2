import { inferenceConfig } from "../../config/config.js";
import { AnthropicAdapter } from "./anthropic.adapter.js";
import { OpenCodeZenAdapter } from "./opencode-zen.adapter.js";
import type { LlmAdapter } from "./llm-adapter.js";

let _adapter: LlmAdapter | null = null;

export function getLlmAdapter(): LlmAdapter {
  if (_adapter) return _adapter;
  _adapter =
    inferenceConfig.LLM_PROVIDER === "anthropic"
      ? new AnthropicAdapter()
      : new OpenCodeZenAdapter();
  return _adapter;
}

export { type LlmAdapter, LlmError } from "./llm-adapter.js";
