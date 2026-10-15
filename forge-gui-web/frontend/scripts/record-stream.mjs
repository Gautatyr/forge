// Records one viewer's WebSocket stream to a JSONL file (one server message per line) until the
// game's final delta, for adapter tests (src/adapter/fixtures/). Node >= 22 (global WebSocket).
// Usage: node scripts/record-stream.mjs --token <token> --out <file.jsonl> [--url ws://127.0.0.1:7655/ws] [--seat 0] [--timeout 1800]
// The token is in the URL the bridge prints: "[web] serving http://127.0.0.1:PORT/#token=<token>".
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []),
);
if (!args.token || !args.out) {
  console.error('usage: record-stream.mjs --token <token> --out <file.jsonl> [--url ws://…/ws] [--seat N] [--timeout S]');
  process.exit(2);
}
const url = `${args.url ?? 'ws://127.0.0.1:7655/ws'}?token=${encodeURIComponent(args.token)}&seat=${args.seat ?? 0}`;
const lines = [];
const ws = new WebSocket(url);
const timer = setTimeout(() => finish(1, 'timeout'), Number(args.timeout ?? 1800) * 1000);

function finish(code, why) {
  clearTimeout(timer);
  writeFileSync(args.out, lines.join('\n') + '\n');
  console.log(`${why}: ${lines.length} messages → ${args.out}`);
  ws.close();
  process.exit(code);
}

ws.onmessage = (e) => {
  lines.push(String(e.data));
  const m = JSON.parse(String(e.data));
  if (m.t === 'delta' && m.final) finish(0, 'final delta');
};
ws.onclose = () => finish(1, 'closed before the final delta');
ws.onerror = () => finish(1, 'socket error');
