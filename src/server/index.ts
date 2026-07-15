/**
 * Colyseus server entry (P3-01). Boots one `dam` room definition. Hosting is
 * deferred (boss decision), so this is the process a host would run later:
 *   PORT=2567 tsx src/server/index.ts
 * The client points VITE_COLYSEUS_URL at ws://host:PORT to connect.
 */
import { Server } from 'colyseus';
import { DamRoom } from './DamRoom';

const port = Number(process.env.PORT ?? 2567);
// Bind 0.0.0.0 so Render/containers can route to it (localhost-only = 502).
const host = process.env.HOST ?? '0.0.0.0';

const gameServer = new Server();
gameServer.define('dam', DamRoom).filterBy(['roomCode']);

void gameServer.listen(port, host).then(() => {
  console.log(`[otty] Colyseus server listening on ${host}:${port}`);
});
