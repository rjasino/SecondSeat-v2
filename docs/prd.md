# SecondSeat - Product Requirements Document

## 1. Overview & Objective

- **Problem Statement:** For decades, players have relied on guides to get unstuck, but every format breaks immersion in a different way. Printed guides make you put the controller down. Wikis and GameFAQs force tab-switching and scroll hunting. YouTube walkthroughs turn playing into watching. Even AI chat tools often require typing and over-explain. The problem is not only spoilers — it is guide overhead. Long RPG walkthroughs, manuals, and forum threads turn play into research. Guidance exists, but accessing it still breaks the player's flow.
- **Core Insight:** Most players do not want the full answer. They want just enough help, at the right moment, without losing discovery. They need a filter that protects the mystery of the game while solving the frustration of the moment.
- **One-Line Pitch:** We help busy players — especially retro gamers — get unstuck without breaking immersion by delivering spoiler-safe micro-hints through a second-screen companion. Unlike wikis, walkthrough videos, and generic AI tools that force context switching, guide overhead, or over-explain.
- **Goals:** Provide a second-screen, voice-or-text companion that offers real-time, non-invasive, spoiler-aware guidance without disrupting gameplay.
- **Strategic Value:** Prototype a "flow-preserving" AI interaction model — guidance as a minimal interface, not a maximal answer engine — that can be generalized to other domains like developer tools and real-time support.

---

## 2. Target Audience & Personas

### Persona A: The Busy Progress-Seeker

A player with limited session time who needs to make progress without turning playtime into research time.

- **Pain Points:** Wastes time hunting through guides; gets stuck and drops sessions; dislikes walls of text and long walkthrough overhead.
- **Goals:** Make steady progress in short sessions without ruining the game.
- **How We Help:** SecondSeat turns stuck moments into 1–3 line answers that get players moving again fast.

### Persona B: The Retro Explorer

A player tackling classic RPGs and adventure games where dense walkthroughs, manual-era friction, and fragmented guide sources create friction.

- **Pain Points:** Long, dense RPG and adventure guides; missing manual-era context; obscure puzzles; fragmented or outdated guide sources.
- **Goals:** Finish classics with enough context to progress while preserving discovery.
- **How We Help:** SecondSeat repackages old guide knowledge into concise, spoiler-aware hints tailored to the current moment.

---

## 3. Requirements & User Stories

### User Stories

| ID   | As a [Persona]... | I want to [Action]...                        | So that [Value/Goal]...                                                           |
| :--- | :---------------- | :------------------------------------------- | :-------------------------------------------------------------------------------- |
| US.1 | Busy Player       | ask questions via voice or text              | I don't have to stop playing to search a wiki or type long prompts.               |
| US.2 | Any Player        | receive concise 1–3 line spoiler-aware hints | I can progress without losing the sense of discovery.                             |
| US.3 | Retro Explorer    | ask about obscure classic-game puzzles       | I get relevant hints grounded in structured guide data, not hallucinated answers. |
| US.4 | Any Player        | ask follow-up questions in the same session  | the assistant retains lightweight context so I don't have to repeat myself.       |

### Acceptance Criteria & User Paths

- **Happy Path:** Player is stuck in a dungeon → Asks "I'm in the water temple — where do I go next without spoilers?" → SecondSeat returns a 1–3 line hint grounded in indexed guide data → Player continues playing instantly.
- **Unhappy Path / Edge Cases:** Voice recognition failure (player falls back to text input); LLM over-explanation (policy constraints and RAG grounding enforce brevity); ambiguous question (system asks a clarifying question rather than dumping a solution).
- **Functional Requirements:** Voice-or-text input, RAG-based retrieval from structured game guides, spoiler-level policy enforcement, lightweight session memory for follow-up questions, and optional text-to-speech output.

---

## 4. Scope & Constraints

### In-Scope (MVP)

- Single game, single area — one believable retro-game stuck scenario where the alternative is reading a long walkthrough.
- Voice or text question input.
- Retrieval from structured guide data (Markdown / HTML sources).
- 1–3 line spoiler-safe responses.
- Lightweight session memory for follow-up questions within a session.
- Web-based UI (browser-first, second-screen experience).
- Basic hint tolerance levels (vague nudge vs. direct answer).

### Out-of-Scope (MVP)

- Multi-game coverage — deferred until the interaction model and content structure are validated.
- Social or community features — deferred; the core wedge is trust in guided hints, not a gaming network.
- Native mobile apps, screen scraping, direct game memory injection, or invasive game overlays.
- Broad original content operation — MVP uses existing guide material for prototyping; production shifts toward commissioned writers and creator partnerships.

### Dependencies

- High-quality, structured walkthrough and guide data for the target game/area.
- Reliable LLM inference API access (Anthropic Claude) and embedding model runtime (`@xenova/transformers`).
- Redis instance for BullMQ job queue.

### Limitations

- Requires a second screen (phone, tablet, or secondary monitor) or OBS overlay for the intended use case.
- Dependent on internet connectivity for LLM inference (Anthropic API).
- Spoiler discipline depends on guide data quality and policy constraint tuning.

---

## 5. Success Metrics (KPIs)

- **Primary Metric:** Players prefer SecondSeat micro-hints over searching Google, a wiki, or a video for stuck moments (validated qualitatively and by repeat session usage).
- **Secondary Metrics:**
  - Hint accuracy — low hallucination rate, grounded in indexed guide content.
  - Spoiler discipline — low complaint rate on spoiler exposure.
  - Repeat session usage across long-form games.
  - Early willingness to pay from heavy users or creators once trust is established.
  - Reduction in "pause time" or context-switching per session.

---

## 6. Business & Monetization

### Revenue Model

SecondSeat starts with a freemium experience, but early monetization is closer to Patreon than traditional SaaS — letting players who believe in the project support development while receiving practical perks. This matches the trust-first, niche nature of the product.

| Tier                                | Description                                                                                            |
| :---------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **Free / Starter**                  | Limited daily hints, one active session, core spoiler-safe guidance.                                   |
| **Supporter (Patreon Tier 1)**      | More sessions, longer memory, early access to supported games, project updates.                        |
| **Creator Circle (Patreon Tier 2)** | Heavier supporter access, roadmap input, behind-the-scenes updates, future creator/community features. |

### Go-To-Market

- **First 100 users:** Busy players in long-form and retro games; retro communities frustrated by dense, fragmented guide behavior.
- **First 10,000:** Creator demos, clips, retro communities, and word-of-mouth around clean "just enough help" moments.
- **Growth loop:** Once a player gets unstuck cleanly, SecondSeat becomes the default tool they open before a wiki or video.

---

## 7. Risks & Assumptions

- **Technical Risks:** LLM hallucinations (incorrect guidance); voice processing latency; insufficient structured guide coverage for the target game.
- **Content Risks:** Building enough high-quality, spoiler-annotated guide data; maintaining spoiler discipline across ambiguous player questions.
- **Mitigation:** Start with one game and one area; use policy constraints and curated guide data; test against believable stuck scenarios before expanding.
- **Security Requirements:** Audio privacy — recording only when triggered (push-to-talk); GDPR compliance for session data; raw audio is never persisted — transcription only, discarded after the hint response is returned.
- **Assumptions:** Users have a stable internet connection and a second screen (laptop, phone, or tablet) nearby. Players already keep a second screen during sessions — SecondSeat fits the existing habit.

---

## 8. Competitive Landscape

| Alternative             | Limitation                                                                                                    |
| :---------------------- | :------------------------------------------------------------------------------------------------------------ |
| Wikis / GameFAQs        | Comprehensive, but force tab-switching, scroll hunting, and often expose spoilers prematurely.                |
| YouTube walkthroughs    | Turn playing into watching; hard to control spoiler depth.                                                    |
| Generic AI chat tools   | Flexible, but over-explain, hallucinate, or behave like solvers instead of restrained guides.                 |
| Status quo / DIY search | Fragmented and slow; players stitch answers across tabs, videos, and forums while the session loses momentum. |

**Defensible Advantages:**

- **Data moat** — Structured, spoiler-aware guide data organized around player progress and hint granularity.
- **Technology moat** — Retrieval plus policy constraints tuned for brevity, relevance, and spoiler discipline.
- **Brand / community moat** — Trust built around restraint; players return because the product helps without taking over.
- **Distribution moat** — Natural fit for second-screen setups already used by streamers, PC players, and console players.

---

## 9. Open Questions

- [x] **Spoiler granularity** — Default hint mode is **vague nudge**: the system gives the minimum directional hint needed to unblock the player without revealing the solution. No exact-answer mode in MVP.
- [x] **Voice trigger** — Wake phrase is **"Hey SS"**. Player says "Hey SS" to open the voice input window; recording stops when the player stops speaking (VAD) or after a timeout.
- [ ] **Content operation** — Commissioned writers and creator partnerships are a known scaling path but deferred until viability is proven. MVP uses existing guide material for prototyping.
- [ ] **Monetization formalization** — _Context:_ the Patreon model works for an early community but at some point needs to be replaced with formal billing infrastructure (subscriptions, metered usage, payment tiers). The trigger for that switch — whether it's a user count, revenue threshold, or a specific traction signal — is a post-viability decision. Deferred until the core experience is validated.
