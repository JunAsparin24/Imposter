import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
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


const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const clientDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
const serveClient = !DEV && existsSync(clientDist);
const appPort = serveClient ? PORT : 5173;

/**
 * Wi-Fi addresses for local testing: when the room screen is opened on localhost, the join address
 * uses this computer's Wi-Fi address instead. On a real website (Render) the page's own address is used.
 */
app.get('/api/join-info', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ lan: lanAddresses().map((ip) => `http://${ip}:${appPort}`) });
});

// In production the server also serves the built React app (one service to deploy).
// In dev (`--dev`) the Vite dev server on :5173 serves the app instead.
if (serveClient) {
  app.use(compression()); // gzip: much faster first load on phones / over the online link
  // Hashed build files never change, so phones can cache them for good.
  app.use('/assets', express.static(join(clientDist, 'assets'), { immutable: true, maxAge: '365d', index: false }));
  app.use(express.static(clientDist, { index: false, maxAge: '1d' }));
  app.get('*', (_req, res) => {
    // Always fetch the latest page so a rebuilt game is picked up straight away.
    res.set('Cache-Control', 'no-cache');
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

// '::' listens on IPv4 and IPv6, so "localhost" answers instantly whichever one it resolves to.
httpServer.listen(PORT, '::', () => {
  console.log(`IMPOSTER server on http://localhost:${PORT}`);
  if (!serveClient && !DEV) console.log('   (client not built - run `npm run build`, or use `npm run dev`)');
  console.log(`   Open the game: http://localhost:${appPort}`);
  for (const ip of lanAddresses()) console.log(`   Phones on your Wi-Fi: http://${ip}:${appPort}`);
  console.log('   Note: rooms live in memory and are lost when the server restarts.');
});
