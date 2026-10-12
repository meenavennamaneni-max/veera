# Dev's Personal AI

A Discord bot by **Dev Chowdhary** that answers questions by **retrieving** server
information — built-in facts, message history, and announcements.

> **This is not AI.** Dev's Personal AI is a basic server-information assistant
> powered by JavaScript search and retrieval. It uses keyword matching over
> predefined facts and Discord messages fetched through the REST API. It does
> **not** use Gemini, Google Gen AI, OpenAI, any AI model/API, or any generated
> answers. If it cannot retrieve an answer, it says so.

**Runtime:** JavaScript modules on **Cloudflare Workers**, driven by **Discord
HTTP Interactions** (slash commands). There is **no Gateway connection** and no
`discord.js`/`discord.py` — Discord POSTs each interaction to the Worker URL and
the Worker replies over the Discord REST API with `fetch()`.

## Commands

| Command | What it does |
| --- | --- |
| `/ask question:<text>` | Answers from **built-in bot facts** first; otherwise returns relevant **accessible Discord history** with links; otherwise states no answer is available. Never pretends to be generative AI. |
| `/server question:<text>` | Searches accessible server messages and returns relevant results with **channel names, timestamps, and original message links**. |
| `/announcements topic:<text>` | Searches accessible announcement channels and returns matching announcements with **dates and original message links**. |

Try `/ask question:who created the bot` — it answers:
*Dev's Personal AI was created and developed by Dev Chowdhary.*

### Built-in knowledge

- Bot name: Dev's Personal AI
- Creator: Dev Chowdhary
- Platform: Discord (HTTP Interactions)
- Runtime: Cloudflare Workers
- Purpose: search server information, history, and announcements
- Implementation: JavaScript retrieval — no AI model

## Architecture

```
Discord client ──slash command──▶ Discord ──POST /interactions──▶ Cloudflare Worker
                                     ▲                                │
                                     │         Ed25519 verify,        │
                                     │         PING/PONG, defer        ▼
                                     │                         command handlers
                                     │                                │
                                     └──REST (fetch, rate limits)─────┤
                                                                      ▼
                                                            Cloudflare D1 (optional
                                                            message index cache)
```

- `src/index.js` — Worker entry: Ed25519 signature + timestamp verification,
  PING→PONG, validation, deferral (type 5), async command execution, follow-ups.
- `src/discord.js` — Discord REST v10 client (`fetch()`), pagination, 429/5xx
  retry handling, interaction signature verification (WebCrypto Ed25519).
- `src/search.js` — keyword tokenizing/scoring, message retrieval, D1 index
  reads/writes, result formatting with channel names, timestamps and jump links.
- `src/commands/ask.js` — built-in facts + history fallback.
- `src/commands/server.js` — server-wide retrieval search.
- `src/commands/announcements.js` — announcement-channel search.
- `scripts/register-commands.js` — registers the three slash commands.
- `scripts/index-messages.js` — bulk-populates the D1 index from the REST API.
- `migrations/0001_init.sql` — D1 schema for the message index.
- `tests/` — signature, REST client, search, command, and routing tests.

## Prerequisites

- Node.js 20+ (this repo is tested on Node 22)
- A [Cloudflare account](https://dash.cloudflare.com) and Wrangler
  (`npm install` installs it locally)
- A [Discord application](https://discord.com/developers/applications)

## 1. Create the Discord application

1. Open <https://discord.com/developers/applications> → **New Application** →
   name it **Dev's Personal AI** → Create.
2. **General Information** → copy:
   - **Application ID**
   - **Public Key** (used by the Worker to verify every interaction signature)
3. **Bot** → **Add Bot** (if needed) → **Reset Token** → copy the **bot token**
   (this is a secret — never commit it).
4. Keep the portal open; you will paste the **Interactions Endpoint URL** after
   deploying.

## 2. Invite the bot to your server

Use this URL (replace `<APPLICATION_ID>`). It requests exactly the permissions
the bot needs — **never Administrator**:

```
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot%20applications.commands&permissions=84992
```

Permission integer `84992` = **View Channels** (1024) + **Send Messages** (2048)
+ **Embed Links** (16384) + **Read Message History** (65536).

The bot only reads channels it can access. Channels hidden from it are skipped
(HTTP 403) and never guessed at.

## 3. Create the D1 database

```bash
cd veera
npm install
npx wrangler login
npx wrangler d1 create devs-personal-ai
```

Copy the printed `database_id` into `wrangler.toml`
(`[[d1_databases]] database_id = "..."`).

Apply the schema (local + remote):

```bash
npm run migrations:local     # for `wrangler dev`
npm run migrations:remote    # for the deployed Worker
```

## 4. Configure secrets

**Production (Cloudflare):**

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY   # paste the Public Key
npx wrangler secret put DISCORD_BOT_TOKEN    # paste the bot token
```

**Local development:**

```bash
cp .dev.vars.example .dev.vars
# fill in DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, and for scripts:
# DISCORD_APPLICATION_ID, DISCORD_GUILD_ID
```

`.dev.vars` is gitignored. The scripts read the same file automatically.

## 5. Register the slash commands

```bash
npm run register                       # guild commands if DISCORD_GUILD_ID is set (instant),
                                       # otherwise global commands (may take up to 1 hour)
npm run register -- --guild <GUILD_ID> # force guild-scoped registration
npm run register -- --global           # force global registration
```

The script prints the registered commands. It uses the same command definitions
as the Worker (`src/commands/*.js data`), so they cannot drift apart.

## 6. Deploy and set the interactions endpoint

```bash
npm run deploy
```

Wrangler prints your Worker URL, e.g.
`https://devs-personal-ai.<your-subdomain>.workers.dev`.

In the Discord developer portal → **General Information** →
**Interactions Endpoint URL**, paste:

```
https://devs-personal-ai.<your-subdomain>.workers.dev/interactions
```

Save. Discord immediately sends a signed PING to verify the endpoint; the
Worker answers `{"type":1}` (PONG) only if the Ed25519 signature verifies, so
saving the URL doubles as a live signature-verification test. If Discord
rejects the URL, check that `DISCORD_PUBLIC_KEY` matches the portal exactly.

## 7. Populate the D1 index (optional but recommended)

Live searches always query the Discord REST API directly. The D1 index extends
searches further back in time and speeds up repeats. Two population processes:

1. **Automatic:** every search caches the messages it retrieved (batched D1
   upserts). The index grows as the bot is used.
2. **Explicit bulk indexing:**

```bash
npm run index-messages -- --guild <GUILD_ID> --max-per-channel 300
npx wrangler d1 execute devs-personal-ai --remote --file d1-index.sql
```

Add `--prune` to delete previously indexed rows per scanned channel before
writing (drops messages deleted since the last run — the bot REST API has no
delete events without a Gateway). Re-run periodically to keep the index fresh.

## Testing

### Automated tests (49 assertions)

```bash
npm test
```

Covers:

- **Signature verification** — valid/tampered/wrong-key signatures, malformed
  hex, stale timestamps (replay protection).
- **Command registration shape** — exactly `/ask`, `/server`, `/announcements`.
- **Routing** — PING/PONG, 401 on bad signatures, unknown commands, missing
  options, deferral, follow-up delivery with channel names/timestamps/links.
- **Search** — tokenizing, scoring, pagination caps, permission skips (403),
  announcement scoping, D1 index round-trips, jump links.
- **Error handling** — 429 rate-limit retries, 5xx backoff, honest "not found"
  responses, no fabricated messages.

### Local smoke test

```bash
cp .dev.vars.example .dev.vars   # put any test public key + token in it
npm run dev                      # wrangler dev on http://127.0.0.1:8787
curl http://127.0.0.1:8787/      # health check text
```

To verify signature rejection locally, POST an unsigned body:

```bash
curl -i -X POST http://127.0.0.1:8787/interactions \
  -H 'content-type: application/json' -d '{"type":1}'
# -> 401 invalid request signature
```

(Positive signature tests use generated Ed25519 keys inside `npm test`; for a
signed live check, use the portal's Interactions Endpoint URL or run the real
slash commands.)

### Live tests in Discord

1. `/ask question:who created the bot` → exact creator sentence (instant fact).
2. `/ask question:what runtime do you use` → Cloudflare Workers fact.
3. `/ask question:<distinctive phrase from an old message>` → retrieved messages
   with `#channel`, localized timestamps, and Jump links.
4. `/ask question:what is the airspeed velocity of an unladen swallow` → honest
   "could not find an answer" (nothing invented).
5. `/server question:<keyword>` → server-wide results with channel names,
   timestamps, links; footer states how many messages/channels were retrieved.
6. `/announcements topic:<keyword>` → results from announcement channels with
   dates and links; a clear message if the server has none.
7. Wrong permission test: hide a channel from the bot → it is skipped and
   excluded from results (never fabricated).
8. Error handling: stop the bot's View Channels permission mid-search → concise
   ephemeral error mentioning required permissions.

## Retrieval limitations (by design)

- **No AI model** — answers are canned facts or keyword matches on retrieved
  messages. Unmatched questions get an honest "not found".
- **Permission-bound** — only channels where the bot has **View Channels** and
  **Read Message History** are searched; everything else is skipped (403).
- **Time-windowed** — searches retrieve the most recent messages first
  (500 messages / 40 channels / 100 per channel by default, tunable in
  `src/search.js` `SEARCH_LIMITS`). Older messages appear only via the D1 index.
- **Deleted messages** — retrieval only returns what currently exists. Index
  rows can go stale between refreshes; re-run `scripts/index-messages.js --prune`.
- **Threads and voice channels** are not scanned (text and announcement
  channels only).
- Results always link to the **original message** — click through to confirm.

## Security

- Every interaction is verified with Discord's **Ed25519** signature over
  `timestamp + raw body` (WebCrypto) plus a ±5-minute timestamp freshness check
  before anything is parsed or executed.
- The **bot token** and **public key** live in Cloudflare Worker secrets /
  `.dev.vars` — never in code, never in the client.
- The bot requests **View Channels, Read Message History, Send Messages, Embed
  Links** only (permission integer 84992). No Administrator, no privilege
  bypassing.
- Mention pings are disabled on all responses (`allowed_mentions: {"parse": []}`).
- Discord API errors and rate limits (429 with `retry_after`, 5xx) are retried
  with backoff; failures produce concise, honest error messages.

## Project layout

```
src/index.js                    Worker entry (verify, PING, route, defer)
src/discord.js                  REST client + Ed25519 verification
src/search.js                   Keyword search, retrieval, D1 index
src/commands/ask.js             /ask — facts + history
src/commands/server.js          /server — server history search
src/commands/announcements.js   /announcements — announcement search
scripts/register-commands.js    REST command registration
scripts/index-messages.js       Bulk D1 index population
scripts/lib.js                  Shared script env loading
migrations/0001_init.sql        D1 schema
tests/*.test.js                 node:test suite
wrangler.toml                   Worker + D1 binding
.dev.vars.example               Local secrets template
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Discord rejects the Interactions Endpoint URL | `DISCORD_PUBLIC_KEY` must match the portal's Public Key exactly (64 hex chars). |
| Commands don't appear | Guild commands are instant; global ones can take up to 1 hour. Check `npm run register` output. |
| "Discord denied access (HTTP 403)" | Re-invite the bot with permission 84992 and make sure the channels are visible to its role. |
| Empty results | Only accessible, retrievable messages count — try keywords from the message, or run `scripts/index-messages.js` to deepen the index. |
| 429 errors in logs | Expected under load; the client retries automatically with `retry_after`. |

---

*Dev's Personal AI was created and developed by Dev Chowdhary.*
