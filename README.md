# Imposter Mafia

A multiplayer party game you play on your phones. Everyone gets the same secret word except
the **Imposters** (red), who only get a hint word and have to bluff. The **Innocents** (green)
give one-word clues out loud, discuss, and vote on their phones to catch every Imposter.

## How to play a game

1. **Room screen:** on a laptop or TV, open the website and tap **Create Room**. That screen now
   shows the site address and a 4-character room code. It isn't a player.
2. **Join:** everyone opens the website on their phone and enters the code. Each avatar can only be used once.
   **The first person to join is the host** and runs the game from their phone.
3. Optional: the host taps **Practice round** first. It uses an easy everyday word (like Pizza) and
   gives no points, which is good for new players.
4. **Roles:** press and hold your card. Innocents see the word. Imposters see `???`, the **hint word**
   (all Imposters get the same one), and who the other Imposters are.
5. **Clues:** take turns saying ONE word out loud (same speaking order every round). Then discuss
   and vote in secret. The voted-out player's name shows first; the host taps **Reveal** to show their role.
6. **Final guess:** a caught Imposter says one guess **out loud**. An Innocent taps **They got it** or
   **Wrong**. Correct = the Imposters win.

Scoring: Innocents win +2 each · Imposters win +3 each · each vote for an Imposter +1 · correct final
guess +3. The host can lock the room, hand over hosting, kick players, change settings, make a
custom word pack (`Word | hint` per line), and reset scores.

## Game modes

The host picks a mode in Settings.

- **Classic:** Innocents get the secret word. Imposters get a hint word and know who the other Imposters are.
- **Chaos:** a secret, random number of Imposters each match (about 1 in 7 matches has none). Imposters don't
  know each other, and only get a hint in some matches. Always elimination voting with Skip allowed.
  With no Imposters, skipping the vote wins for everyone; voting someone out means Paranoia and nobody wins.

## Special roles

Switched on by the host under Settings → Special roles (only dealt when there are enough players,
never in practice rounds). Everyone can see which special roles are in play, but not who has them.

- **Jester** (4+ players): one non-Imposter knows the word but wins alone (+4) if the group votes them
  out, which ends the match. Otherwise the Jester loses.
- **Detective** (5+ players): an Innocent who, once per match (not per round), secretly checks one
  player during clues or discussion and learns whether they are an Imposter. Only they see the answer.
- **Saboteur** (5+ players): an Imposter who, once per match, skips the current speaker's turn or
  cuts discussion to 10 seconds. Everyone sees that a Saboteur struck, but not who.
- **Mayor** (5+ players): an Innocent whose vote secretly counts twice. Ballots stay private, so the
  Mayor can't prove who they are, and an Imposter can claim to be the Mayor too.

Detective, Saboteur and Mayor are extra powers on top of a normal team, so they win or lose with it.

## Putting it online (Render)

The repo includes `render.yaml`, so it deploys as one web service:

1. In Render: **New → Blueprint**, pick this GitHub repo (or **New → Web Service** with
   Build `npm install --include=dev && npm run build`, Start `npm start`).
2. Every push to GitHub redeploys automatically.
3. Share the `…onrender.com` address. People type it in and enter the code from the room screen.

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

The second item is the hint every Imposter sees. Keep words easy and familiar, and don't make the
hint give the word away.

## Privacy & fairness

- The server deals the roles. An Imposter's phone never receives the secret word, and only Imposters
  receive the hint. The room screen only gets public info.
- Votes stay secret until the match ends. Only Innocents (who know the word) can confirm a final guess.
- Disconnected players keep their seat. Refreshing puts them straight back in. A disconnected
  speaker is skipped after 20 s, and voting doesn't wait forever for offline phones.
