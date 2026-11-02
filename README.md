# 🎄 IMPOSTER: Christmas Edition

A real-time multiplayer social-deduction party game for phones. Everyone gets the same Christmas
secret word — except the **Grinches** (imposters, red), who must bluff their way through. The
**Elves** (innocents, green) give one-word clues out loud, discuss, and vote on their own phones
to catch every Grinch.

## Quick start (local)

Requires **Node.js 20+**.

```bash
npm install
npm run dev
```

- Open **http://localhost:5173** on your computer.
- Phones on the **same Wi-Fi**: open `http://<your-computer-ip>:5173` (the server prints the exact
  address on startup). On Windows, allow Node.js through the firewall when prompted.

`npm run dev` starts both the game server (port 3001) and the Vite dev server (port 5173, which
proxies `/socket.io` to the game server).

### Production mode (one process)

```bash
npm run build   # builds the React app into client/dist
npm start       # game server on PORT (default 3001) also serves the app
```

Then open `http://localhost:3001` (or `http://<your-ip>:3001` from phones).

### Tests

```bash
npm test          # 38 server tests: game rules, role privacy, Socket.IO multi-client integration
npm run typecheck # shared + server + client
```

## Deploying so friends can join from anywhere

The app deploys as **one Node web service** (the server hosts the built frontend), so the invite
link and QR code work automatically. Any host that runs a long-lived Node process and supports
WebSockets works (Render, Railway, Fly.io, a VPS…). Serverless/edge "functions" hosts do **not**
work, because Socket.IO needs a persistent server.

**Render (free tier)** — `render.yaml` is included:

1. Push this repo to GitHub.
2. In Render: *New → Blueprint* → pick the repo. Or create a *Web Service* manually with  
   Build: `npm install --include=dev && npm run build` · Start: `npm start`.
3. Open the `.onrender.com` URL and share the room link/QR.

Environment variables (all optional):

| Variable         | Purpose                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `PORT`           | Port to listen on (hosts usually set this).                                  |
| `TRUST_PROXY`    | Set to `1` behind a proxy/load balancer so rate limits see real client IPs.  |
| `CLIENT_ORIGINS` | Extra allowed browser origins, comma-separated (same-origin is always allowed). Only needed if you host the frontend separately, together with `VITE_SERVER_URL` at build time. |

> ⚠️ **Rooms live in memory.** Restarting/redeploying the server ends all games. Free hosts that
> sleep when idle will also clear rooms. The storage layer (`server/src/net/roomStore.ts`) is an
> interface so it can be swapped for Redis later.

## How a match works

1. **Lobby** — host creates a room (6-character code, invite link, QR code). Players join with a
   name + avatar. No accounts.
2. **Role reveal** — each phone privately shows *tap-and-hold to reveal* (or tap-to-toggle).
   Elves see the word + category. Grinches see `???` and **always see their fellow Grinches**
   ("You're the only Grinch" when alone). The role can be reopened any time via **My role**.
3. **Clues** — a server-shuffled speaking order. The current speaker taps *Done speaking* (or the
   host skips). The first speaker rotates each round.
4. **Discussion** — optional timer the host can pause, extend (+30s), or skip.
5. **Voting** — secret ballots on each phone; only the count of submitted votes is shown.
   Ties → revote among the tied players → tie again → nobody is eliminated.
6. **Results** — the voted-out player's role is revealed. A caught Grinch may get a **final guess**:
   correct = the whole Grinch team wins.
7. **End** — Elves win when every Grinch is out; Grinches win when they equal or outnumber the
   Elves. Then: full reveal, points, scoreboard, *Play again*.

**Scoring:** Elves win +2 each · Grinches win +3 each · each vote for a Grinch +1 · correct final
guess +3 bonus. Scores persist across matches in the room until the host resets them.

### Voting systems

- **Elimination** (default) — vote someone out every round until a team wins.
- **Single vote** — one decisive vote; each ballot names as many players as there are Grinches.
  Catch every Grinch → Elves win (unless a final guess succeeds). Name any Elf → Grinches win.

### Fairness & edge-case policies

- **Disconnects:** your seat, role, and score are kept; refresh or reopen the page to rejoin
  (a reconnect token is stored in the browser). Opening the game in a second tab moves your
  session there.
- **Speaker offline:** their turn is skipped after 20 s.
- **Voter offline:** voting closes once every remaining voter has been offline for 20 s, or when
  the voting timer ends. Missing ballots count as abstentions. The host can also end voting early.
- **Host offline:** keeps the host role for 30 s, then it passes to the longest-connected player.
  If the host leaves, it passes immediately.
- **Leaving mid-match:** the player is out of the match and their role is revealed; win
  conditions are re-checked right away.
- **Joining mid-match** is blocked; players can join between matches.
- **Settings changed mid-match** only apply to the next match.
- Abandoned rooms are deleted after 10 minutes with nobody connected.

## Project structure

```
shared/   Types, constants, and rules shared by server + client (the event contract)
server/   Express + Socket.IO game server (authoritative)
  src/game/Room.ts       The state machine: roles, turns, votes, wins, scoring, privacy
  src/game/wordBank.ts   Loads word packs, picks words, checks final guesses
  src/words/*.json       Christmas word packs (10 categories, 50+ words each) + Undercover pairs
  src/net/gameServer.ts  Socket.IO wiring: validation, auth by session, rate limits, timers
  test/                  Vitest unit + multi-client integration tests
client/   React + Vite + Tailwind + Framer Motion mobile-first UI
```

### Security model

- The server decides everything: roles, word, who may act, eliminations, wins, points.
- Identity comes only from the server-issued session bound to the socket — player IDs sent by a
  client are ignored. Reconnect tokens are random 192-bit values.
- Each player receives a **separate private payload**; the public snapshot never contains the word,
  live roles, or individual ballots (tests assert this over real sockets). Grinch browsers never
  receive the word at all.
- Every event is schema-validated (zod), rate-limited, and checked against the current phase.
  Host actions carry a phase sequence number so double taps can't advance a phase twice.
- Room codes and role assignment use Node's `crypto` RNG.

## Adding words

Edit or add a JSON file in `server/src/words/`:

```json
{ "id": "food", "words": ["Eggnog", { "word": "Hot Chocolate", "aliases": ["Hot Cocoa"] }] }
```

`aliases` are extra answers accepted for the final guess (no fuzzy matching). New categories also
need an entry in `CATEGORIES` in `shared/src/constants.ts`.

## Roadmap

- **Phase 2:** custom word packs from the host, richer stats, more host controls.
- **Phase 3:** more sounds/animations, accessibility and reconnect polish.
- **Phase 4:** Undercover mode (pairs already authored in `undercover-pairs.json`) and Chaos mode.
