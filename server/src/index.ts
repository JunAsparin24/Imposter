import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { WordBank } from './game/wordBank';
import { createGameServer, type GameIo } from './net/gameServer';
import { InMemoryRoomStore } from './net/roomStore';

const PORT = Number(process.env.PORT ?? 3001);
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const EXTRA_ORIGINS = (process.env.CLIENT_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
/** Set by "Start IMPOSTER.bat": allow the temporary Cloudflare online link. */
const ALLOW_TUNNEL_ORIGINS = process.env.ALLOW_TUNNEL_ORIGINS === '1';
/** Set by "Start IMPOSTER.bat": a file the launcher writes the online link into once it's ready. */
const ONLINE_URL_FILE = process.env.ONLINE_URL_FILE;
const DEV = process.argv.includes('--dev');

/** This computer's Wi-Fi/LAN addresses, most likely home-network ones first. */
function lanAddresses(): string[] {
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address)
    .sort((a, b) => rank(a) - rank(b));
}

function onlineUrl(): string | null {
  if (!ONLINE_URL_FILE) return null;
  try {
    const url = readFileSync(ONLINE_URL_FILE, 'utf8').trim();
    return /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(url) ? url : null;
  } catch {
    return null;
  }
}

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const clientDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
const serveClient = !DEV && existsSync(clientDist);
const appPort = serveClient ? PORT : 5173;

/** Links the lobby uses for its invite link / QR code. */
app.get('/api/join-info', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    lan: lanAddresses().map((ip) => `http://${ip}:${appPort}`),
    online: onlineUrl(),
    onlinePending: !!ONLINE_URL_FILE && !onlineUrl(),
  });
});

// In production the server also serves the built React app (one service to deploy).
// In dev (`--dev`) the Vite dev server on :5173 serves the app instead.
if (serveClient) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);

/**
 * Same-origin connections (the normal case: Vite proxy in dev, static hosting in prod) are
 * always allowed. Cross-origin browsers must be listed in CLIENT_ORIGINS.
 */
function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // non-browser clients
  if (EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (ALLOW_TUNNEL_ORIGINS && url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com')) return true;
    return url.host === host;
  } catch {
    return false;
  }
}

const io: GameIo = new Server(httpServer, {
  cors: { origin: EXTRA_ORIGINS, methods: ['GET', 'POST'] },
  allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, req.headers.host)),
  maxHttpBufferSize: 16 * 1024,
});

createGameServer({ io, store: new InMemoryRoomStore(), words: new WordBank(), trustProxy: TRUST_PROXY });

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`IMPOSTER Christmas Edition server on http://localhost:${PORT}`);
  if (!serveClient && !DEV) console.log('   (client not built - run `npm run build`, or use `npm run dev`)');
  console.log(`   Open the game: http://localhost:${appPort}`);
  for (const ip of lanAddresses()) console.log(`   Phones on your Wi-Fi: http://${ip}:${appPort}`);
  console.log('   Note: rooms live in memory and are lost when the server restarts.');
});
