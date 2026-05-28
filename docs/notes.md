## Things to check later

- DON'T READ this document during `grep` or any reading of codebase. This is for me as a reminder what other things to do later post-MVP.
- ask AI to check for MVP only configuration and decisions that made in order to ship this product faster.
- i need to iron out those decisions before to make it production ready.
- SDD is stale, LlamaIndex was not use in inference need to update it at some point.
  - later for a new task, alignment of data_model to packages/db models
- take note of this: `gameArea / chapter conflict — the inference generateSchema currently marks them as required strings (min(1)). But you said they're optional since not all games have the same structure. The proxy can't omit them without breaking the Zod validation in inference. We either need to relax the inference schema to optional() or send a default like "unknown". Which do you prefer?
Inferred context — on the test page these are manual inputs. Just confirming there's no planned inference step that auto-detects the player's area from their question text (which would change how the form should work).`
- `❓ `gameArea`, `chapter`, `subArea` are described as "inferred based on hint request" — for this test page they are optional manual inputs. Is there a future inference step that auto-populates these, or will they always be tester-supplied? — Owner: rjasino-fs

❓ The inference `generateSchema` requires `gameArea` and `chapter` as non-optional strings (`min(1)`). But the user says they are not always required. Should the inference schema be relaxed to `optional()` before this UI ships, or should the proxy enforce defaults (e.g. `"unknown"`) when omitted? — Owner: rjasino-fs`

- I need to fix the data_model.md (doc) and implementation (code) drift. The code implemented a normalized structure over the embedded approach for mongoDB.
