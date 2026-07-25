# Konuş — learn conversational Turkish

A fun, efficient PWA for getting **conversational** in Turkish (for English
speakers). Built around fast-fluency methodology: high-frequency words first,
formulaic **phrase chunks**, comprehensible example sentences, and spaced
repetition — with an AI conversation partner coming in Phase 2.

**Phase 1 (this MVP): a full spaced-repetition trainer** — installable, offline,
no login, all progress stored locally on-device.

## Run it

No build step. Serve the folder and open it:

```sh
npm run dev          # python3 -m http.server 8000
# → open http://localhost:8000
```

First launch: pick your level, goal, and daily pace, then start reviewing.
Cards show the English meaning (try to *say* it in Turkish), then reveal the
Turkish with audio and an example. Rate **Again / Hard / Good / Easy**.

## Develop

```sh
npm test             # node --test — pure logic: scheduler, queue, deck, day, reactive
npm run typecheck    # tsc --noEmit over // @ts-check JSDoc (needs: npm install)
npm run build:deck   # regenerate data/deck.json from content/deck.source.mjs
```

## How it's built (buildless by design)

Vanilla ES modules, no bundler — served straight from `main:/` to preserve the
existing GitHub Pages deploy. A ~60-line reactive helper drives the UI; logic
lives in pure, unit-tested modules.

```
js/srs/scheduler.mjs   SM-2 + learning-steps scheduler (pure)
js/srs/queue.mjs       builds today's study queue (pure)
js/deck/{schema,loader} deck contract + fetch/validate/reconcile
js/store/{db,settings}  IndexedDB (cards, reviews, chats) + localStorage
js/lib/{reactive,day}   signals/effects + streak date-math
js/audio/tts.mjs       Turkish SpeechSynthesis (feature-detected)
js/views/*             onboarding, dashboard, review, settings
content/deck.source.mjs curated deck source → scripts/build-deck.mjs → data/deck.json
```

Content and progress are separate: the deck ships as immutable JSON keyed by
stable entry ids, so deck updates never disturb a learner's SRS state. **Never
reuse an entry id** — add new entries at the end of a unit.

## AI conversation (Phase 2) — voice-first

Add your Anthropic API key in **Settings → AI conversation** (stored on-device,
sent only to `api.anthropic.com`), then tap **Practice speaking** and pick a
scenario. It's a **hands-free voice loop**: the tutor greets you out loud → the
mic opens → you speak Turkish → the tutor replies in short Turkish and speaks it
→ the mic reopens. Replies stay within words you've started learning, with a
collapsible correction only when you make a real mistake. Tap any word for a
gloss, **Translate** a whole reply, and see a rough per-session cost in the
header. The 🎙️/⌨️ header button switches between voice and typing.

Voice **input** uses the browser's speech recognition — **Chrome or Edge**, with
microphone permission (it's cloud-based, not offline). Voice **output** uses an
on-device Turkish (`tr-TR`) voice. Where either is missing, it falls back to
typing / on-screen text automatically. Modules: `js/audio/asr.mjs` (recognition),
`js/audio/tts.mjs` (speech).

All API calls go through `js/ai/client.mjs` behind a configurable `baseUrl`, so
swapping browser-direct for a serverless proxy (for a public launch) is a
one-line change. Models: `claude-sonnet-5` for conversation, `claude-haiku-4-5`
for translate/gloss.

```
js/ai/sse.mjs       pure SSE frame parser (tested against fixtures)
js/ai/client.mjs    streaming + non-streaming Anthropic client (baseUrl seam)
js/ai/prompts.mjs   tutor system prompt + correction protocol (pure)
js/ai/vocab.mjs     known-word list from SRS state (pure)
js/ai/helpers.mjs   translate / gloss / test-key + request bodies
js/ai/pricing.mjs   per-session cost estimate
js/views/chat.mjs   streaming chat UI
```

## Roadmap (Phase 3)

More content toward ~1000 words, pre-recorded audio, extra drills,
speech-recognition practice, and JSON export/import backup.
