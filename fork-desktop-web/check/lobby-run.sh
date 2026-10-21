#!/usr/bin/env bash
# One scripted game through the launcher's match path (LobbyRun: LocalLobby -> WebHostedMatch -> web seat 0),
# seat 0 played by fork-web's human-seat.mjs, the other views checked by ws-check.mjs.
# Usage from the repo root, after the build of `make play` (frontend dist + cp.txt):
#   fork-desktop-web/check/lobby-run.sh <outdir> <label> [LobbyRun args...]
#   e.g. fork-desktop-web/check/lobby-run.sh target/runs cmd4 --players 4 --deck0 ~/.forge/decks/commander/x.dck
# VIEWERS=spectator,1,2,3 (default spectator) are checked alongside the human seat.
# Writes <outdir>/<label>.{server.log,human.json,check.json}; exit 0 = the game ended, the match handed
# back to the lobby, and both checks passed.
set -uo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$1"
out=$(cd "$1" && pwd); label="$2"; shift 2
log="$out/$label.server.log"
MAIN=forge.fork.desktop.LobbyRun "$root/fork-desktop-web/run.sh" --wait-client 120 "$@" > "$log" 2>&1 &
srv=$!
until grep -q '^\[web\] seat 0 (' "$log"; do
  kill -0 "$srv" 2>/dev/null || { echo "server died"; tail -20 "$log"; exit 1; }
  sleep 1
done
sleep 1 # every seat line is out
port=$(grep -o '^\[web\] serving http://127.0.0.1:[0-9]*' "$log" | head -1 | sed 's/.*://')
tok() { grep -o "^\[web\] $1.*token=[A-Za-z0-9_-]*" "$log" | head -1 | sed 's/.*token=//'; }
seat_tokens=$(for s in $(grep -o '^\[web\] seat [0-9]* (' "$log" | awk '{print $3}' | sort -u); do printf '%s=%s,' "$s" "$(tok "seat $s (")"; done)
url="ws://127.0.0.1:$port/ws"
check="$root/fork-web/spike-viewer/check"
node "$check/ws-check.mjs" --url "$url" --token "$(tok serving)" --seat-tokens "$seat_tokens" \
  --timeout 3600 --viewers "${VIEWERS:-spectator}" > "$out/$label.check.json" 2> "$out/$label.check.err" &
chk=$!
node "$check/human-seat.mjs" --url "$url" --seat 0 --token "$(tok 'seat 0 (')" --timeout 3600 \
  > "$out/$label.human.json" 2> "$out/$label.human.err"
hrc=$?
wait "$chk"; crc=$?
wait "$srv"; src=$?
grep -q '^\[web\] match over and handed back to the lobby' "$log"; brc=$?
echo "human exit=$hrc check exit=$crc server exit=$src handed back=$([ "$brc" -eq 0 ] && echo yes || echo no)"
[ "$hrc" -eq 0 ] && [ "$crc" -eq 0 ] && [ "$src" -eq 0 ] && [ "$brc" -eq 0 ]
