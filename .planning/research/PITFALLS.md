# Domain Pitfalls: RAG Content Awareness + Personality Switching + User Onboarding

**Domain:** Personal blog AI chat assistant (Hugo + Node.js + DeepSeek API)
**Researched:** 2026-04-26
**Overall confidence:** HIGH

---

## Executive Summary

This document catalogs pitfalls specifically relevant to adding three features to an existing AI chat application: (1) injecting blog content metadata into the system prompt for RAG-like content awareness, (2) personality switching via preset system prompts, and (3) new-user detection with inline greeting and name registration.

Research confirms that these three features interact in non-obvious ways. The most dangerous pitfalls are those where one feature silently degrades another -- e.g., RAG content tokens consuming the context budget needed for persona consistency, or personality drift erasing the content-awareness value. The fundamental constraint is **token budget management across three competing prompt components** (personality, blog index, conversation history), compounded by the well-documented "lost in the middle" attention pattern in LLMs.

---

## Critical Pitfalls

Mistakes that cause silent degradation, rewrites, or fundamental design flaws.

### Pitfall 1: Token Budget Exhaustion from Competing Prompt Components

**What goes wrong:** The final system prompt has three components -- personality (300-800 tokens per preset), blog content index (varies by post count), and conversation history (up to MAX_CONTEXT_MESSAGES). Without explicit budget management, these silently exceed the model's effective context window. Even if technically within the raw token limit, the LLM's "lost in the middle" attention pattern means content in the middle 70-80% of the prompt is effectively invisible.

Research from COLM 2025 (Veseli, Chibane, Toneva & Koller, arXiv:2508.07479) demonstrates that for inputs under 50% of the context window, primacy + recency dominate and middle content collapses. For a DeepSeek model with ~64K context, a 10K-token assembled prompt (16% of window) would exhibit strong lost-in-the-middle effects on the blog content index if it sits between personality and conversation history.

**Why it happens:** Each feature is built in isolation. The personality engineer optimizes for vividness (longer prompt), the RAG engineer includes all available metadata, and neither measures the combined token count.

**Consequences:** AI appears to have "forgotten" blog content mid-conversation, or personality abruptly reverts to generic assistant. Users perceive the feature as broken with no visible error. No crash or log entry occurs -- the model simply ignores parts of the prompt.

**Prevention strategy:**
- Implement a token-counting utility that sums personality + blog index + estimated history tokens before sending each request
- Set a hard cap on blog index tokens (e.g., 2,500 tokens max) with truncation of older/lower-priority posts
- Keep personality prompts concise (150-300 tokens each, not 500-800)
- Log the computed token budget per request for monitoring

**Detection warning signs:**
- AI can't answer questions about the 3rd-5th most recent post but nails the 1st and 15th
- Personality "resets" to generic assistant after 10+ message exchanges
- Adding one more blog post to the index suddenly breaks content awareness entirely

**Phase to address:** Phase 2 (RAG) -- must be designed into the prompt assembly architecture from the start

---

### Pitfall 2: Persona Drift Over Multi-Turn Conversations

**What goes wrong:** Even with a fixed system prompt, LLMs drift from assigned personas during long conversations. Research from Tosato et al. (PERSIST study, AAAI 2026) tested 25+ models from 1B to 685B parameters across 2M+ responses and found persistent instability -- even 400B+ models show standard deviations >0.3 on 5-point personality scales. Conversation history paradoxically *increases* variability rather than stabilizing it. After 15-20 message exchanges, "warm senior" gradually becomes generic helpful assistant.

**Why it happens:** The system prompt is a one-shot instruction at position 0 of the message array. As conversation history grows, the recency bias strengthens -- the model increasingly attends to recent assistant responses (which trend toward default behavior) and less to the initial system prompt. This is not a bug; it is an architectural property of Transformer attention.

**Consequences:** Users who chat for extended sessions observe the AI losing its personality. The "重金属黑色死亡摇滚青年" preset degrades fastest because it's furthest from the model's RLHF fine-tuning. Users perceive the personality feature as "not working" or "shallow."

**Prevention strategy:**
- Acknowledge that drift is inevitable and plan for it rather than fighting it
- For the most extreme personality preset ("重金属"), test whether DeepSeek can even maintain it for 5+ turns
- Consider a "personality refresh" mechanism: after N turns without a personality-relevant response, re-inject a condensed personality reminder as a system-level message
- More practically for this project: keep personality prompts concise and focused on tone/style rather than complex role-play, which degrades less
- Set expectations: personality adds flavor, not deep character simulation

**Detection warning signs:**
- After ~15 messages, all 4 personalities begin converging to the same tone
- The "重金属" personality drops its distinctive style after 3-5 exchanges
- AI starts responding with "As an AI assistant..." (base model leakage)

**Phase to address:** Phase 3 (Personality) -- test each personality through 30-message conversations before shipping

---

### Pitfall 3: Attention Competition Between Personality Instructions and Blog Content

**What goes wrong:** When a user asks a blog content question ("what posts do you have about Docker?"), the AI must simultaneously maintain personality AND retrieve accurate content. Research on persona-reasoning interaction (Kim et al., "Jekyll & Hyde" framework, ACL 2025) shows that persona prompts can degrade task performance -- their solution ensembles outputs from both role-playing and neutral prompts for a +9.98% accuracy gain. In our context, this means the AI might either:
- Answer accurately but lose personality (reads like a search engine)
- Maintain personality but hallucinate or miss relevant posts (reads like a person who vaguely remembers)

**Why it happens:** LLMs cannot architecturally distinguish between "instructions about how to behave" and "data to process." When both compete for attention in the same context window, the model blends them. The personality saying "be playful and teasing" competes with the content data saying "these are the exact post titles."

**Consequences:** The combined value proposition ("an assistant that knows the blog AND has personality") fails. Users get either accurate-but-boring or fun-but-wrong. Neither state produces errors, so this goes undetected without explicit testing.

**Prevention strategy:**
- Structure the system prompt to clearly separate layers with explicit markers:
  ```
  ## IDENTITY (highest priority)
  [base identity -- who you are]

  ## TONE (applies to ALL responses)
  [personality instructions]

  ## KNOWLEDGE (reference only, do not fabricate)
  [blog content index]
  ```
- Use explicit instructions like "When answering questions about the blog, use the KNOWLEDGE section for facts but maintain your TONE."
- Test specifically for: "can the AI recommend a relevant post while staying in character?"
- Place blog content at the end (recency position) for retrieval accuracy, but reinforce personality through a short reminder at both start and end (bookend strategy)

**Detection warning signs:**
- Content-aware answers sound like a search result, not a person
- Personality shines in casual chat but vanishes when blog topics arise
- AI confidently recommends a non-existent post because personality mode overrides knowledge constraints

**Phase to address:** Phase 2 (RAG) and Phase 3 (Personality) integration testing

---

### Pitfall 4: Silent Content Staleness from Build-Time JSON Generation

**What goes wrong:** `posts-index.json` is generated during `hugo build` but the backend loads it once at startup (in `loadSystemPrompt()` or equivalent). New blog posts published via Hugo rebuild update the JSON on disk, but the running Node.js process never sees them until manually restarted. The AI assistant cheerfully claims "I don't have any posts about X" when the post was published hours ago.

**Why it happens:** The simplest implementation pattern (load at startup) creates an invisible cache. Unlike a database, JSON files have no built-in invalidation mechanism. Unlike a real RAG system, there is no re-indexing trigger.

**Consequences:** Blog author publishes a post, tests the AI, and it doesn't know about the new content. Author assumes the feature is broken. No errors are logged -- the file is valid, just stale. This is a "works on my machine" bug where restarting the server temporarily fixes it.

**Prevention strategy:**
- Implement file watching: use `fs.watch` or `fs.watchFile` on `posts-index.json` to reload on change
- As a simpler alternative: reload the JSON on a fixed interval (e.g., every 60 seconds) with a lightweight stat check (only re-read if mtime changed)
- Add an explicit `/admin/reload-content` endpoint for manual refresh without full restart
- Log the file's mtime on each request so staleness is observable
- Add a timestamp field to `posts-index.json` (build date) and expose it in a debug response header

**Detection warning signs:**
- AI claims no posts exist about a recently published topic
- Restarting the Node.js process suddenly "fixes" content awareness
- Blog author is the first person to discover the stale state

**Phase to address:** Phase 2 (RAG) -- must be part of the initial implementation, not a follow-up fix

---

### Pitfall 5: New User Re-Registration Loop from Private Browsing / Storage Clearing

**What goes wrong:** The new-user detection relies on `localStorage` UUID absence. When a user opens the blog in private/incognito mode, every visit generates a fresh UUID. Each visit triggers the greeting flow and re-registration. The DB's `UNIQUE` constraint on `client_uuid` prevents duplicate UUIDs, but each new UUID creates a new `user_profiles` row. The greeting flow becomes an annoyance, not a welcome.

**Why it happens:** `localStorage` is device-local and session-scoped in private mode. It is fundamentally ephemeral. The design assumes UUID persistence implies user persistence, but the mapping is one UUID to one storage context, not one UUID to one human.

**Consequences:** Returning users in private mode see the greeting repeatedly. The database accumulates orphaned user profiles. Worse: if a returning user *expects* to be recognized (because they registered last time), repeated greeting flows feel broken.

**Prevention strategy:**
- Implement server-side IP hash matching as a re-identification fallback (already partially present in the `user_profiles` table with `ip_hash` column)
- On new UUID detection, query `user_profiles` by `ip_hash` before showing greeting -- if a match exists with a recent `last_seen_at`, skip the greeting
- Add a grace period: if the IP had a registered user in the last 24 hours, treat as returning
- Accept the limitation: document that private browsing users will see the greeting each time
- Consider a cookie-based backup identifier (survives private mode within a session, complements localStorage)

**Detection warning signs:**
- `user_profiles` table grows faster than expected with same-IP rows
- User reports: "I already registered but it keeps asking my name"
- Testing in incognito mode reveals the loop

**Phase to address:** Phase 1 (already partially done -- `ip_hash` column exists) + Phase 4 (Greeting) integration

---

## Moderate Pitfalls

Mistakes that cause degraded UX, maintainability issues, or subtle bugs.

### Pitfall 6: Front Matter Schema Drift Breaking JSON Generation

**What goes wrong:** Blog posts use inconsistent front matter fields. Some use `summary`, others use `description`. Some use `tags: ["Docker"]`, others use `tags: ['tecs']`. The Hugo template that generates `posts-index.json` references fields that don't exist on all posts, silently producing `null` or empty strings in the JSON. The backend loads the JSON and injects incomplete data into the system prompt.

**Why it happens:** The blog has 16+ posts written over time with evolving conventions. The Hugo template assumes uniform schema. Hugo's templating doesn't throw errors on missing front matter fields -- it outputs empty strings.

**Consequences:** Some posts have empty summaries in the AI's knowledge. The AI can mention a post's title but not describe what it's about. Users ask "what's that post about?" and the AI shrugs. Not a crash, but a degraded experience that's hard to notice in testing unless every post is checked.

**Prevention strategy:**
- Audit all existing posts for front matter consistency before building the JSON template
- In the Hugo template, use fallback logic: `{{ .Params.summary | default .Params.description | default .Summary }}`
- Add a Hugo template validation step that logs warnings for posts missing expected fields
- Normalize tags: decide on a canonical tag format and create a Hugo partial that transforms any format

**Detection warning signs:**
- Some blog posts have empty descriptions in the generated JSON
- AI responds with "I don't know much about that post" for older articles
- `posts-index.json` has inconsistent field presence

**Phase to address:** Phase 2 (RAG) -- pre-implementation audit

---

### Pitfall 7: Personality Switch Mid-Conversation Causing Tone Schizophrenia

**What goes wrong:** User chats for 10 messages as "warm senior" (senior-style responses are in conversation history), then switches to "重金属黑色死亡摇滚青年." The new system prompt says "be dark and edgy," but the conversation history contains 10 messages of warm, gentle tones. The model must reconcile contradictory signals. Research shows this produces blending (the model picks elements of both) rather than clean switching. The first few responses after a switch are tonally confused.

**Why it happens:** The model sees the full conversation history. The history is evidence of "how I should talk" and contradicts the new system prompt. LLMs use conversation history as few-shot examples, and those examples now demonstrate the *wrong* personality.

**Consequences:** First 1-3 responses after personality switch feel like a confused blend. User perceives the personality feature as low-quality. The extreme personalities ("重金属") suffer most because the contrast with history is sharpest.

**Prevention strategy:**
- Send the `personality_id` with each chat request so the backend can include an explicit instruction: "You have just switched to a new personality. All previous messages were written in a different style. Respond ONLY in the new style described above."
- Consider whether to include a "clear context on switch" option (aggressive but clean) or "adapt gradually" (natural but messy)
- For this project's scope: accept the trade-off. Add the switch instruction to the system prompt assembly and let 1-2 transitional messages be slightly blended
- Document this as expected behavior in any UI copy

**Detection warning signs:**
- First response after personality switch uses vocabulary from BOTH personalities
- AI says things like "hey buddy... I mean, MORTAL" (style collision)
- The effect is worst when switching TO extreme personalities

**Phase to address:** Phase 3 (Personality) -- design the personality_id transmission in chat requests

---

### Pitfall 8: Greeting Flow Timing vs Personality Selection

**What goes wrong:** The greeting ("Hi, I'm Zhu Yutong's AI assistant! What's your name?") appears when the chat panel opens for a new user. But the user might see the personality dropdown first and select "重金属" before the greeting appears, or the greeting might appear and use a default tone that doesn't match the user's eventual personality choice. The onboarding experience feels incoherent.

**Why it happens:** The greeting trigger (no UUID in localStorage) and personality initialization (read from localStorage, default to "warm senior") are independent code paths. They don't coordinate.

**Consequences:** New user selects personality, then immediately sees a greeting that doesn't reflect it. The first AI interaction ("what's your name?") uses the wrong personality, establishing a wrong first impression.

**Prevention strategy:**
- Ensure the personality dropdown is visible BEFORE the greeting triggers
- OR: hardcode the greeting as a frontend UI state (not an AI-generated message) so it doesn't depend on the current personality
- Recommended: show the greeting as static HTML in the chat panel (not an SSE message), with tone-neutral copy. After name registration, the first actual AI message uses the selected personality
- Flow: open panel -> show personality selector + greeting text + name input -> user selects personality + enters name -> POST /register -> first AI message in chosen personality

**Detection warning signs:**
- Greeting tone doesn't match selected personality
- Personality dropdown and greeting appear to race each other
- User changes personality during the name-input phase

**Phase to address:** Phase 4 (Greeting) -- UI flow design before implementation

---

### Pitfall 9: Name Input XSS When Displayed in Chat

**What goes wrong:** User enters their name in the greeting input. This name is sent to `POST /register` and stored in the `user_profiles.name` column. If the name is later displayed in the chat UI (e.g., AI says "你好，张三！") via innerHTML or textContent without sanitization, and the name contains HTML/JS, it becomes an XSS vector.

**Why it happens:** Backend stores the name as-is (SQLite text column, no validation beyond type). Frontend inserts it into the DOM. The gap between "user input" and "display context" lacks sanitization.

**Consequences:** Stored XSS: a malicious name like `<img src=x onerror=alert(1)>` executes when displayed. In practice, this is low-severity for a personal blog (the attacker would need to self-XSS), but it represents a code quality issue and a real risk if the blog ever supports multi-user chat.

**Prevention strategy:**
- Backend: strip HTML tags from names before storing. Allow only Chinese characters, letters, numbers, spaces, and common punctuation. Max 50 characters.
- Frontend: always use `textContent` (not `innerHTML`) when inserting user-provided names into the DOM
- Add a `SANITIZE_NAME` regex to the registration endpoint
- Reject names that contain `<`, `>`, `&`, `"`, `'` (or escape them)

**Detection warning signs:**
- Name field accepts HTML-like input
- ESLint flags innerHTML usage near user data
- Name rendering code doesn't distinguish between safe and user-provided text

**Phase to address:** Phase 4 (Greeting) -- input validation at registration endpoint

---

### Pitfall 10: Hugo Build Output Path and Nginx Static File Serving

**What goes wrong:** `posts-index.json` is generated by Hugo into the `public/` directory (or a custom location). But the blog frontend also needs to know where to find it (for potential future client-side use). Worse: if the JSON is placed at a URL that's publicly accessible, anyone can fetch the blog's structured content index. This is intentional for RAG but means the structured metadata is openly crawlable.

**Why it happens:** Hugo outputs everything in `public/` as static files. JSON is just another output format. Nginx serves all static files by default.

**Consequences:** The `posts-index.json` at `/posts-index.json` is publicly accessible. This is fine for the intended use (backend reads it), but it means the structured blog content is trivially scrapeable. Not a security issue per se, but worth noting for content strategy.

**Prevention strategy:**
- Accept that the JSON is public (it's derived from already-public blog content)
- If privacy is desired: place the JSON outside the web root and have the backend read from filesystem path, not URL
- For this project: the JSON contains only title/summary/tags/links -- same information visible on the blog. Public is fine.
- Ensure the JSON is minified in production (no pretty-print) to reduce file size

**Detection warning signs:**
- `curl https://2p1c.life/posts-index.json` returns structured data (verify this is intentional)

**Phase to address:** Phase 2 (RAG) -- output path configuration

---

## Minor Pitfalls

Edge cases and quality-of-life issues.

### Pitfall 11: Atomic File Write Race Condition on Hugo Build

**What goes wrong:** During `hugo build`, the JSON template writes to `public/posts-index.json`. If the Node.js backend's file watcher triggers mid-write (file is partially written), the backend reads incomplete JSON, parse fails, and content awareness silently degrades to fallback (no blog knowledge).

**Why it happens:** Hugo writes files directly to their final path. Most filesystem writes are not atomic. The watch event fires on the first write, not on file close.

**Prevention strategy:**
- In the Hugo template or build script: write JSON to a temp file (`posts-index.json.tmp`), then atomically rename to `posts-index.json` (on same filesystem, rename is atomic)
- In the backend: wrap JSON parsing in try-catch with graceful fallback to previous valid state
- Simpler approach: the backend reloader waits 500ms after detecting a file change before reading (debounce)

**Detection warning signs:**
- Intermittent "failed to parse posts-index.json" errors in backend logs
- Content awareness works on some deploys but not others
- Correlated with build timing (deploy while user is chatting)

**Phase to address:** Phase 2 (RAG) -- implementation detail

---

### Pitfall 12: DeepSeek API Rate Limiting with Increased Token Usage

**What goes wrong:** Adding RAG content and personality prompts increases the per-request token count. The new system prompt may be 3-5x larger than the base identity prompt. If the DeepSeek API has rate limits based on token consumption (not just request count), the blog's chat assistant may hit limits faster.

**Why it happens:** The base system prompt is ~500 tokens (the current `system_prompt.txt`). Adding RAG content could add 1,500-3,000 tokens. Adding personality adds 200-500 tokens. The total prompt per request could reach 4,000-5,000 tokens before any conversation history.

**Consequences:** Rate limit errors appear as failed SSE streams (no graceful degradation), "upstream failed" errors in the chat panel, or 429 responses from DeepSeek. Users see request failures with no explanation.

**Prevention strategy:**
- Check DeepSeek API rate limits (requests per minute, tokens per minute) before designing prompt sizes
- Monitor token consumption in the backend: log `(personality_tokens + rag_tokens + history_tokens)` per request
- If approaching limits, implement token trimming: reduce blog index to top N most recent/relevant posts
- Have a fallback mode: if rate-limited, send a minimal prompt (identity only, no RAG, no personality) rather than failing entirely

**Detection warning signs:**
- 429 HTTP status from DeepSeek API
- Token consumption per request has increased 3-5x from baseline
- Failures correlate with longer prompts

**Phase to address:** Phase 3 (Personality) -- after both RAG and personality prompts are finalized, measure combined token usage

---

### Pitfall 13: Greeting State Lost on Panel Close

**What goes wrong:** New user opens the chat panel, sees the greeting and name input, but accidentally closes the panel (mouse leave, click elsewhere). When they reopen, what state are they in? If the greeting is one-shot and gone, the user never registers a name. If the greeting reappears, returning users who closed accidentally see it again.

**Why it happens:** The chat panel has hover-based open/close behavior (mouse leave closes it). The greeting is a UI state that exists only while the panel DOM is rendered. There's no persistent "mid-onboarding" state.

**Consequences:** New users who accidentally close the panel during onboarding are stuck in a limbo state: they have a UUID (generated on first panel open) but no registered name. They won't see the greeting again (because UUID exists), but the AI doesn't know their name either.

**Prevention strategy:**
- Introduce a three-state user model: `unknown` (no UUID), `identified` (UUID + registered name), and `anonymous` (UUID but no registered name)
- Show a subtle "Set your name?" prompt for anonymous users (not the full greeting, but a non-blocking nudge)
- Or: make the greeting flow resistant to interruption by storing the "onboarding in progress" flag
- Simplest approach for this project: if UUID exists but no name is registered, show a one-liner "Want to tell me your name?" that appears inline, not as a full takeover of the chat panel

**Detection warning signs:**
- Users have UUIDs in localStorage but no corresponding row in `user_profiles`
- Panel close during onboarding creates orphan anonymous state
- The flow has no resumption mechanism

**Phase to address:** Phase 4 (Greeting) -- state machine design

---

### Pitfall 14: Conversation History Containing Old System Prompts

**What goes wrong:** The current code stores `system`, `user`, and `assistant` messages in the `messages` table. The `buildUpstreamMessages` function currently filters out `system` messages from history before sending to the API. But if personality switching is implemented by changing the system prompt, and old system messages are filtered, this is fine. If the implementation ever changes to NOT filter system messages, old system prompts (from a previous personality) would leak into the context, confusing the model.

**Why it happens:** Architectural drift: the filtering logic was written for a static system prompt. When system prompts become dynamic, the filtering assumption may be forgotten or accidentally broken.

**Consequences:** AI receives TWO system prompts: the current personality and an old one from a previous session. Behavior becomes unpredictable.

**Prevention strategy:**
- Keep the `system` message filtering in `buildUpstreamMessages` and add a comment explaining why: "System messages from DB history represent previous session configurations and must not be sent upstream"
- Never store the assembled system prompt in the messages table. Store only user and assistant messages.
- Add an integration test that verifies old system prompts are excluded

**Detection warning signs:**
- AI responses reference personality traits from a previously selected persona
- The messages table contains rows with `role = 'system'`
- `buildUpstreamMessages` loses the `role !== 'system'` filter

**Phase to address:** Phase 3 (Personality) -- code review checklist item

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 2 (RAG) | Token budget exhaustion (#1) | Implement token counting before first deploy; set hard caps |
| Phase 2 (RAG) | Silent staleness (#4) | File watcher or periodic reload with mtime check, not startup-only |
| Phase 2 (RAG) | Front matter schema drift (#6) | Audit all posts before writing the Hugo JSON template |
| Phase 3 (Personality) | Persona drift (#2) | Test each personality through 30-message conversations |
| Phase 3 (Personality) | Attention competition with RAG (#3) | Structured prompt with clear sections; integration testing |
| Phase 3 (Personality) | Personality switch confusion (#7) | Include switch instruction in prompt; accept transitional blending |
| Phase 4 (Greeting) | Re-registration loop (#5) | IP hash fallback; grace period; accept private browsing limitation |
| Phase 4 (Greeting) | Greeting vs personality timing (#8) | Show greeting as static HTML, not AI-generated; personality selector visible first |
| Phase 4 (Greeting) | Name XSS (#9) | Backend sanitization; frontend textContent only |
| Cross-cutting | Prompt composition order (#3, #14) | Deliberate section ordering; integration tests for all personality x query combinations |
| Cross-cutting | Rate limiting (#12) | Measure combined token usage before deploy; implement fallback mode |

---

## Testing Strategy Implications

These pitfalls share a common property: **none produce errors or crashes.** They degrade behavior silently. Standard integration testing (200 OK? SSE stream works? Tokens appear?) will pass while the features are broken. This implies:

1. **Behavioral assertions are mandatory:** Tests must check *what the AI says*, not just that it says something. Example: "When asked about Docker posts, does the AI's response mention the actual post title 'Docker Container Deployment and Network Communication Principles'?"

2. **Multi-turn testing is mandatory:** Persona drift and attention competition only manifest after 10+ message exchanges. Single-turn tests will miss them.

3. **Combinatorial coverage is non-negotiable:** 4 personalities x (content query / casual chat / greeting) x (new user / returning user) = 24 test scenarios minimum. A scripted test runner with assertions is strongly recommended.

4. **Golden dataset:** Maintain a small set of known blog posts and expected AI responses for regression testing. After any prompt change, re-run against the golden dataset.

---

## Sources

- Veseli, Chibane, Toneva & Koller (COLM 2025). "Positional Biases Shift as Inputs Approach Context Window Limits." arXiv:2508.07479 -- [Summary](https://arxiv.org/html/2508.07479v1/)
- Tosato, Helbling et al. (AAAI 2026). "Persistent Instability in LLM's Personality Measurements: Effects of Scale, Reasoning, and Conversation History." -- [Semantic Scholar](https://www.semanticscholar.org/paper/Persistent-Instability-in-LLM's-Personality-Effects-Tosato-Helbling/b515d1e0fdc4f93275a3837f3801d48b4c351f4c)
- Kim et al. (ACL 2025). "Persona is a Double-Edged Sword: Rethinking the Impact of Role-play Prompts in Zero-shot Reasoning Tasks." -- [ACL Anthology](https://aclanthology.org/2025.findings-ijcnlp.51/)
- Abdulhai et al. (Stanford, Oct 2025). "Consistently Simulating Human Personas with Multi-Turn Reinforcement Learning." -- [arXiv](https://browse-export.arxiv.org/abs/2511.00222)
- Snyk Labs (Aug 2025). "RAGPoison: Persistent Prompt Injection via Poisoned Vector Databases." -- [Snyk Labs](https://labs.snyk.io/resources/ragpoison-prompt-injection/)
- Eric-Terminal (Oct 2025). "Cognitive-Hijacking-in-Long-Context-LLMs." -- [GitHub](https://github.com/Eric-Terminal/Cognitive-Hijacking-in-Long-Context-LLMs)
- OWASP Top 10 for LLM Applications (2025). LLM01: Prompt Injection.
- Segment Documentation. "Best Practices for Identifying Users." -- [Segment Docs](https://segment-docs.netlify.app/docs/connections/spec/best-practices-identify)
- Hugo Documentation. "encoding.Jsonify", "Output Formats", "resources.FromString." -- [gohugo.io](https://gohugo.io)
- Current codebase analysis: `ai-assistant/server.js`, `themes/vintage-web-hugo-theme/assets/js/main.js`, `ai-assistant/config/system_prompt.txt`, SQLite schema (`user_profiles` table with `ip_hash` and `UNIQUE(client_uuid)`).
