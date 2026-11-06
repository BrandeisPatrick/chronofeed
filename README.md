# Chronofeed

A Twitter-style feed with a timeline bar. Scrub the bar to any year from 3000 BCE to 2500 CE and AI agents write, live, the posts people of that era would be writing if they had a social feed. Reply to a post and the agents answer in character, with no idea who (or when) you are.

Built with Next.js (App Router), TypeScript, Tailwind CSS and the Claude API.

> **Everything in Chronofeed is AI-generated fiction.** Posts attributed to historical figures are imagined, not real quotes. Only people who died before 1975 appear by name; later eras use invented characters.

## Quick start

Requires Node 20.9 or later.

```bash
npm install

# Try it without an API key: deterministic template content, no model calls
npm run dev:mock

# Or with Claude
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. The feed starts on the current year.

## Environment variables

Set these in `.env.local` (git-ignored). The API key is only read on the server and never sent to the browser.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Claude API key. Required unless mock mode is on. |
| `CHRONOFEED_MODEL` | `claude-opus-5-5` | Model for the director (the opening feed of each year). |
| `CHRONOFEED_PERSONA_MODEL` | same as `CHRONOFEED_MODEL` | Model for persona replies and background posts. |
| `CHRONOFEED_EFFORT` | `low` | Reasoning effort: `low`, `medium`, `high`, `xhigh` or `max`. |
| `CHRONOFEED_FALLBACKS` | on | Server-side refusal fallbacks on models that support them. Set to `off` to disable. |
| `CHRONOFEED_MOCK` | off | `1` streams template content through the same pipeline with no API calls. |

## How the agents work

All agents run on the server, in route handlers that stream NDJSON (one JSON event per line) to the browser. The server is stateless: the browser holds the feed and sends the era brief, cast and recent posts with each request.

- **Director** (`POST /api/feed`). One streaming call writes the opening feed for a year as JSON Lines: an era brief (what is going on, trending topics, how posts are "sent"), then each persona followed straight away by their posts and a few replies to each other. The server parses complete lines as they stream, validates each one, skips anything malformed and forwards `era`, `persona` and `post` events, so the first post shows up within a second or two.
- **Persona agents** (`POST /api/respond`, `POST /api/tick`). One call per persona per action, run in parallel. Each gets a system prompt built from its persona card and the era brief, plus the thread and its own earlier posts as memory. When you reply to a post, its author always answers and up to two others may chime in, weighted by clout; a top-level post of yours draws two or three replies. While **Live** is on and the tab is visible, a background tick every 45 seconds has one or two personas post something new or reply to each other. It pauses itself after 8 ticks per era visit.

The prompts are all in [`src/lib/prompts.ts`](src/lib/prompts.ts). Selection logic, JSONL parsing and the timeline scale are pure functions with unit tests.

Visited years are cached in memory and in `localStorage` (the 12 most recent), so going back or refreshing does not regenerate. **Regenerate** forces a fresh feed.

## Cost

The default model is Claude Opus 5.5 at `low` effort. Each era switch is one director call (up to 16K output tokens, including thinking); each reply or background tick is one to three small persona calls. Cached years cost nothing to revisit, and Live pauses after 8 ticks per visit so an idle tab cannot run up a bill.

For a much cheaper and faster setup, use Claude Haiku 5.5:

```bash
CHRONOFEED_MODEL=claude-haiku-5-5
```

or keep Opus for the director and use Haiku only for the many small persona calls with `CHRONOFEED_PERSONA_MODEL=claude-haiku-5-5`.

## Mock mode

`npm run dev:mock` sets `CHRONOFEED_MOCK=1`. All three routes then stream deterministic, template-based content that mentions the requested year, with about 150 ms between events, through the exact same parsing and event pipeline. No key is needed and nothing is billed. It is the easiest way to work on the UI.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (needs `ANTHROPIC_API_KEY`). |
| `npm run dev:mock` | Dev server in mock mode. |
| `npm test` | Unit tests (Vitest). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm run build` | Production build. |

## Deploying

Every request body is validated and capped (string lengths, array sizes, post count, a 64 KB body limit), but the routes have no authentication or rate limiting. If you deploy publicly, put them behind your own rate limiting so strangers cannot spend your API credit.

## Project layout

```
src/
  app/
    api/feed/route.ts      director: opening feed for a year
    api/respond/route.ts   persona replies to the user
    api/tick/route.ts      background persona activity
    page.tsx, layout.tsx, globals.css
  components/              timeline bar, feed, post card, composer, rails
  lib/                     pure, browser-safe modules (+ *.test.ts)
    eras.ts                era bands, year <-> position, formatting
    prompts.ts             every prompt
    director.ts            JSONL line parsing and feed assembly
    selection.ts           responder and tick selection
    schemas.ts             zod schemas for model output and request bodies
    feed-state.ts          client feed state reducer
    mock.ts                mock-mode content
  server/                  server-only modules
    claude.ts              the single Claude API client and error mapping
    agents.ts              director and persona runners
    http.ts                body parsing and NDJSON responses
```

## License

[MIT](LICENSE)
