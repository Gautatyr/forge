#!/usr/bin/env bash
# One scripted human-seat game: starts the server with a human seat 0 (waits for the client, exits after
# the game), plays seat 0 with human-seat.mjs and checks the other views with ws-check.mjs at once.
# Usage from forge-gui-web/ (after `make web-server`'s build, or mvn ... dependency:build-classpath):
#   spike-viewer/check/human-run.sh <outdir> <label> <port> [server args...]
#   e.g. spike-viewer/check/human-run.sh target/runs cmd 7880 --mode commander --players 4 --life 40
# VIEWERS=spectator,1,2,3 (default spectator) are checked by ws-check.mjs alongside the human seat.
# Writes <outdir>/<label>.{server.log,human.json,check.json}; exit 0 = both checks passed.
set -uo pipefail
cd "$(dirname "$0")/../.."
out="$1"; label="$2"; port="$3"; shift 3
mkdir -p "$out"
./run-spike.sh --port "$port" --human-seat 0 --wait-client 120 --exit --label "$label" "$@" > "$out/$label.server.log" 2>&1 &
srv=$!
until grep -q "^\[web\] seat 0 (" "$out/$label.server.log" && [ "$(grep -c '^\[web\] seat ' "$out/$label.server.log")" -ge 2 ]; do
  kill -0 "$srv" 2>/dev/null || { echo "server died"; exit 1; }
  sleep 1
done
sleep 1 # every seat line is out
tok() { grep -o "^\[web\] $1.*token=[A-Za-z0-9_-]*" "$out/$label.server.log" | head -1 | sed 's/.*token=//'; }
seat_tokens=$(for s in $(grep -o '^\[web\] seat [0-9]*' "$out/$label.server.log" | awk '{print $3}'); do printf '%s=%s,' "$s" "$(tok "seat $s (")"; done)
url="ws://127.0.0.1:$port/ws"
node spike-viewer/check/ws-check.mjs --url "$url" --token "$(tok serving)" --seat-tokens "$seat_tokens" \
  --timeout 3600 --viewers "${VIEWERS:-spectator}" > "$out/$label.check.json" 2> "$out/$label.check.err" &
chk=$!
node spike-viewer/check/human-seat.mjs --url "$url" --seat 0 --token "$(tok 'seat 0 (')" --timeout 3600 \
  > "$out/$label.human.json" 2> "$out/$label.human.err"
hrc=$?
wait "$chk"; crc=$?
wait "$srv"
echo "human exit=$hrc check exit=$crc"
[ "$hrc" -eq 0 ] && [ "$crc" -eq 0 ]
