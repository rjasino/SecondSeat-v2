# Changelog

All notable changes to SecondSeat are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## Unreleased

### Fixed

- **Inference / LLM:** `OpenCodeZenAdapter` now passes `input` to OpenCode Zen's Responses API as a structured input-items array (`[{ role: "user", content: userPrompt }]`) instead of a bare string. The proxy's translation to Anthropic Messages dropped the user turn when `input` was a string, surfacing as `400 Error from provider (Anthropic): messages: at least one message is required` at hint stream time. Unit test assertion updated to match the array form. No public API change.

### Changed

- **Inference / LLM:** `OpenCodeZenAdapter` rewritten to use OpenCode Zen's Responses API (`client.responses.create({ stream: true })`) instead of the Chat Completions endpoint, fixing a 404 against `https://opencode.ai/zen/v1/responses/chat/completions`. The adapter now maps `systemPrompt → instructions`, `userPrompt → input`, and translates `response.output_text.delta` events into plain text chunks, preserving the existing `AsyncIterable<string>` `LlmAdapter` interface.
- **Inference / Config:** LLM model is now env-driven on both adapters. Added required env vars `OPENCODE_ZEN_MODEL` (default `opencode/claude-haiku-4-5`) and `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`). Replaced the hardcoded `MODEL_ID` constant in `AnthropicAdapter`.
- **Inference / Config:** `OPENCODE_ZEN_BASE_URL` semantic clarified — must end at `/zen/v1`; the OpenAI SDK appends the route suffix. `.env.example` updated accordingly.

### Added

- **Inference / Tests:** New `apps/inference/src/services/llm/opencode-zen.adapter.test.ts` covering text-delta yielding, non-text-event ignoring, abort-signal clean return, and `LlmError` wrapping. Mocks the OpenAI SDK at the boundary per `.claude/rules/testing.md`.

### Files

- Modified: `apps/inference/src/services/llm/opencode-zen.adapter.ts`
- Modified: `apps/inference/src/services/llm/anthropic.adapter.ts`
- Modified: `apps/inference/src/config/config.ts`
- Modified: `apps/inference/.env.example`
- Added:    `apps/inference/src/services/llm/opencode-zen.adapter.test.ts`

### Notes

- No HTTP contract change. `generate.route.ts`, prompt assembly, and RAG retrieval are untouched.
- Owner must update `apps/inference/.env.local` post-merge: set `OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1` and add `OPENCODE_ZEN_MODEL=opencode/claude-haiku-4-5`.

