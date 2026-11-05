# 🎄 IMPOSTER: Christmas Edition

A multiplayer party game you play on your phones. Everyone gets the same secret word — except
the **Grinches** (imposters, red), who only get a hint word and must bluff. The **Elves**
(innocents, green) give one-word clues out loud, discuss, and vote on their phones to catch
every Grinch.

## How to play a game

1. **Room screen:** on a laptop or TV, open the website and tap **Create Room**. That screen now
   shows the room code and a QR code. It isn't a player.
2. **Join:** everyone opens the website on their phone (or scans the QR code) and enters the code.
   **The first person to join is the host** and runs the game from their phone.
3. Optional: the host taps **Practice round** first. It uses an easy everyday word (like Pizza) and
   gives no points, which is good for new players.
4. **Roles:** press and hold your card. Elves see the word. Grinches see `???`, the **hint word**
   (all Grinches get the same one), and who the other Grinches are.
5. **Clues:** take turns saying ONE word out loud. Then discuss and vote in secret.
6. **Final guess:** a caught Grinch says one guess **out loud**. An Elf taps **They got it** or
   **Wrong**. Correct = the Grinches win.

Scoring: Elves win +2 each · Grinches win +3 each · each vote for a Grinch +1 · correct final
guess +3. The host can lock the room, hand over hosting, kick players, change settings, make a
custom word pack (`Word | hint` per line), and reset scores.

## Putting it online (Render)

The repo includes `render.yaml`, so it deploys as one web service:

1. In Render: **New → Blueprint**, pick this GitHub repo (or **New → Web Service** with
   Build `npm install --include=dev && npm run build`, Start `npm start`).
2. Every push to GitHub redeploys automatically.
3. Share the `…onrender.com` address. People type it in, or scan the QR code on the room screen.

Things to know:
- **Rooms live in the server's memory.** A redeploy or restart ends any game in progress.
- On Render's **free plan** the site goes to sleep after ~15 minutes with no visitors. The next
  visit takes up to a minute to wake it up, and any old rooms are gone. Open the site a minute
  before game night.

## Running it on your computer (for testing)

Requires Node.js 20+.

```bash
npm install
npm run dev     # opens on http://localhost:5173 (phones on your Wi-Fi: use the address it prints)
npm test        # automated tests
```

## Project structure

```
shared/   Types and rules shared by server + client
server/   Express + Socket.IO game server (decides everything: roles, votes, wins, points)
  src/game/Room.ts       The game rules
  src/words/*.json       Word lists: [word, hint] pairs, one file per category
  src/words/practice.json  Easy words for the practice round
client/   React website (phones + room screen)
```

## Editing the words

Each file in `server/src/words/` looks like:

```json
{ "id": "food", "words": [["Cookies", "Oven"], ["Hot Chocolate", "Mug"]] }
```

The second item is the hint every Grinch sees. Keep words easy and familiar, and don't make the
hint give the word away.

## Privacy & fairness

- The server deals the roles. A Grinch's phone never receives the secret word, and only Grinches
  receive the hint. The room screen only gets public info.
- Votes stay secret until the match ends. Only Elves (who know the word) can confirm a final guess.
- Disconnected players keep their seat. Refreshing puts them straight back in. A disconnected
  speaker is skipped after 20 s, and voting doesn't wait forever for offline phones.
