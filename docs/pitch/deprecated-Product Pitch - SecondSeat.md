

**PRODUCT PITCH**

**SecondSeat**

*A Flow-Preserving Gaming Companion.*

Prepared by:

**Roberto J. Asino**

04/01/2026

Version 1.0

# **01  The Core Narrative (The "Hook")**

## **The Big Problem**

*For decades, players have relied on guides to get unstuck, but every format breaks immersion in a different way. Printed guides make you put the controller down. Wikis and GameFAQs force tab-switching and scroll hunting. YouTube walkthroughs turn playing into watching. Even AI chat tools often require typing and over-explain. For busy players, especially retro gamers, the problem is not only spoilers \- it is guide overhead. Long RPG walkthroughs, manuals, and forum threads turn play into research. Guidance exists, but accessing it still breaks the player's flow.*

## **The Insight**

*The key insight is that most players do not want the full answer. They want just enough help, at the right moment, without losing discovery. They need a filter that protects the mystery of the game while solving the frustration of the moment. The timing is right because players already keep a second screen nearby, voice input feels natural, and modern retrieval plus LLM orchestration can shape grounded answers. The win is not more content; it is more restraint.*

## **The One-Line Pitch**

*We help busy players, especially retro gamers, get unstuck without breaking immersion by delivering spoiler-safe micro-hints through a second-screen companion \- unlike wikis, walkthrough videos, and generic AI tools that force context switching, guide overhead, or over-explain.*

# **02  Who This Is For**

*SecondSeat's earliest audience is intentionally narrow: busy players who need help, but do not want that help to take over the session. The strongest early fit is retro gamers, where long walkthroughs, manual-era friction, and fragmented guide sources often turn limited playtime into research time.*

## **The Busy Progress-Seeker**

| Pain Points | *Wastes time hunting through guides; gets stuck and drops sessions; dislikes walls of text and long walkthrough overhead.* |
| :---- | :---- |
| **Goals** | *Make steady progress in short sessions without ruining the game.* |
| **How We Help** | *SecondSeat turns stuck moments into 1-3 line answers that get players moving again fast.* |

## **The Retro Explorer**

| Pain Points | *Long, dense RPG and adventure guides; missing manual-era context; obscure puzzles; fragmented or outdated guide sources.* |
| :---- | :---- |
| **Goals** | *Finish classics with enough context to progress while preserving discovery.* |
| **How We Help** | *SecondSeat repackages old guide knowledge into concise, spoiler-aware hints tailored to the current moment.* |

# **03  The Solution & Interaction Model**

## **Core Solution**

*SecondSeat is a web-first, second-screen gaming companion for stuck moments. A player selects their game, asks by voice or text, and receives a concise spoiler-safe hint in 1-3 lines of text. It does not rely on invasive game integrations; instead it uses explicit game context, session memory, and structured guide data to deliver grounded help.*

## **How Users Interact With It**

1. *The player opens SecondSeat in a browser and selects the game they are playing.*  
2. *They ask a quick question by voice or text, such as "I'm in the water temple \- where do I go next without spoilers?"*  
3. *SecondSeat interprets the request using the chosen game, recent session context, and structured guide data.*  
4. *It returns a short text-first hint that nudges the player forward without dumping the full solution.*  
5. *If the player wants more, they can ask a follow-up or request spoken output.*

## **Key Features (MVP)**

* *Spoiler-Safe Micro-Hints \- Delivers concise, progress-oriented guidance in 1-3 lines so players keep discovery intact.*

* *Voice-or-Text Input \- Lets players ask naturally without stopping to hunt through guides or type long prompts.*

* *Web-First Session Context \- Uses explicit game selection, lightweight session memory, and structured guide data instead of invasive game hooks.*

## 

*What makes the experience different is not that it answers everything. It answers only what is useful now.*

# **04  Why Existing Tools Fall Short**

## **Alternative Landscape**

| Alternative | Limitation vs. Advantage |
| :---- | :---- |
| Wikis / GameFAQs | *Comprehensive, but they force tab-switching, scroll hunting, and often expose spoilers before the player is ready.* |
| YouTube walkthroughs | *Helpful in some cases, but they turn playing into watching and make it hard to control spoiler depth.* |
| Generic AI chat tools | *Flexible, but often over-explain, hallucinate, or behave like solvers instead of restrained guides.* |
| Status quo / DIY search | *Fragmented and slow; players stitch together answers across tabs, videos, and forums while the session loses momentum.* |

## **Defensible Advantages**

* *Data moat \- Structured, spoiler-aware guide data organized around player progress and hint granularity.*

* *Technology moat \- Retrieval plus policy constraints tuned for brevity, relevance, and spoiler discipline, so the system behaves like a dedicated guide companion rather than a generic chatbot with a better prompt.*

* *Brand / community moat \- Trust built around restraint; players return because the product helps without taking over.*

* *Distribution moat \- Natural fit for second-screen setups used by streamers, PC players, and console players with a phone or laptop nearby.*

## **Why SecondSeat?**

*SecondSeat comes from a clear product insight: the real pain is not missing information, but immersion-breaking access to it. That framing leads to a fundamentally different product philosophy \- guidance as a minimal interface, not a maximal answer engine. Instead of asking players to tune a general chatbot, SecondSeat is designed from the ground up around game context, structured guide data, and just-enough help. Building around that constraint from day one makes the experience more credible than retrofitting a generic chatbot into gaming.*

# **05  Technical Architecture**

## **Tech Stack Overview**

*Web-first frontend, lightweight backend services, structured guide database, retrieval layer for relevant passages, and an LLM orchestration layer that enforces spoiler-safe response rules. The stack is intentionally simple for an MVP: browser interface, API service, guide data store, session memory, and hosted model inference.*


## **Architecture Diagram / Description**

![SecondSeat Architecture Diagram](SecondSeat%20-%20Diagram.jpg)  
*SecondSeat uses a two-layer architecture designed to separate live player interaction from AI retrieval and response generation.*

*At the application layer, the system handles two main jobs: runtime query orchestration and content preparation. When a player submits a question, the Query Orchestrator receives it and works with the API and Metadata Builder to assemble the system prompt, game context, and other supporting metadata needed for a grounded response. In parallel, the platform ingests source documents such as markdown and HTML guides, extracts their useful content, and stores the cleaned material in a document database.*

*At the AI and retrieval layer, stored guide content is processed through a worker pipeline that performs chunking and embedding. Those embeddings are written into a vector database so relevant passages can be retrieved efficiently at runtime. When a player asks a question, the generation service uses the prepared metadata and retrieved context to call the generation model, which produces an augmented response grounded in the indexed guide material.*

*This architecture gives SecondSeat a clear separation between offline indexing and live inference. Source content can be continuously prepared, structured, and embedded ahead of time, while runtime requests remain lightweight and focused on retrieving the most relevant context for the player’s current question. The result is a system that is modular, scalable, and flexible across different technology stacks, while still supporting concise, context-aware responses.*

## **Key Technical Decisions & Rationale**

* *Decision 1: Web-first second-screen experience over native overlays \- Faster to ship, works across PC and console play, and avoids invasive integrations.*

* *Decision 2: Structured guide data plus retrieval over open-ended generation alone \- Grounds responses in real walkthrough content and reduces hallucination and spoiler drift.*

* *Decision 3: Explicit context and lightweight session memory over screen scraping or memory hooks \- Improves trust, privacy, and technical feasibility.*

## **Scalability & Risk**

*Biggest risks include building enough structured guide coverage, maintaining spoiler discipline across ambiguous player questions, and tuning hint usefulness so answers are neither too vague nor too revealing. We mitigate these by starting with one game and one area, testing believable stuck scenarios, and using policy constraints plus curated guide data. The architecture scales by separating static guide retrieval from model generation, caching common hint paths, and expanding content coverage game by game.*

# **06  Business and Monetization Strategy**

## **Revenue Model**

*SecondSeat starts with a freemium experience to prove trust and usefulness, but the early monetization model is closer to Patreon than traditional SaaS. The goal is not to aggressively sell software from day one, but to let players who believe in the project support its development while receiving useful perks in return. This matches the product’s niche, trust-first nature and gives the team room to validate the experience before formalizing a more traditional business model.*

*Cold start begins with private prototyping on existing guide material so the team can validate retrieval quality, hint shaping, and spoiler control before building a broader content operation. In production, the strategy shifts away from dependence on third-party guide text and toward original supply through commissioned writers, guide creators, and creator partnerships. That path creates a copyright-safer foundation while also improving quality, consistency, and long-term ownership of the structured guide content that powers SecondSeat.*

## 

## 

## **Pricing Tiers**

| Tier / Plan | Description & Price |
| :---- | :---- |
| Free / Starter | *Limited daily hints, one active session, and core spoiler-safe guidance so players can experience the value before supporting the project.* |
| Supporter / Patreon Tier 1 | *For players who want to help SecondSeat grow while getting practical benefits like more sessions, longer memory, early access to supported games, and project updates.* |
| Creator Circle / Patreon Tier 2 | *For heavier supporters and early believers who want deeper access, input on roadmap priorities, behind-the-scenes development updates, and future creator/community features as they roll out.* |

## **Go-To-Market Strategy**

*The first 100 users come from busy players in long-form and retro games, plus retro communities already frustrated by dense, fragmented guide behavior. Early distribution is paired with a cold-start content strategy: prototype privately with existing guide material, then transition production content toward commissioned writers and creator partnerships. The first 10,000 come from creator demos, clips, retro communities, and word of mouth around clean 'just enough help' moments that save players from reading a long walkthrough. The strongest growth loop is experiential: once a player gets unstuck cleanly, SecondSeat becomes the default tool they open before a wiki or video.*

# **07  Roadmap and MVP Scope**

## **MVP Definition**

*The MVP is deliberately narrow: one game, one area, and one believable retro-game stuck scenario where the alternative is digging through a long walkthrough. In scope are game selection, voice or text question input, retrieval from structured guide data, 1-3 line spoiler-safe responses, and lightweight session memory for follow-up questions. The MVP succeeds if players prefer this micro-hint flow over searching Google, a wiki, or a video.*

## **What is Explicitly OUT of MVP Scope**

* *Broad multi-game coverage \- Deferred until the team proves the interaction model and content structure work in one focused scenario.*

* *Social or community features \- Deferred because the core wedge is trust in guided hints, not a gaming network.*

* *Deep game integrations or overlays \- Deferred to avoid technical complexity and privacy concerns during validation.*

## **Key Milestones & Success Criteria**

* *Demonstrate a believable live scenario where SecondSeat gives the right hint in seconds.*  
* *Show that users prefer micro-hints over traditional search for stuck moments.*  
* *Prove spoiler discipline through qualitative feedback and low complaint rates.*  
* *Measure repeat session usage across long-form games.*  
* *Validate early willingness to pay from heavy users or creators once trust is established.*

# **08  Closing**

*SecondSeat is a focused AI engine for just-enough help, at the right moment. The immediate use case is gaming, but the broader idea is more important: grounded, flow-preserving assistants that reduce friction instead of adding it.*

*End of Product Pitch*