#!/usr/bin/env bash
# One measured run: start the server (waits for a client, exits after the game), attach ws-check.mjs
# from the first message, sample the server's CPU every 2 s. Usage from forge-gui-web/:
#   spike-viewer/check/measure.sh <outdir> <label> [server args...]
# VIEWERS=spectator,0,1 (default spectator) checks those streams at once.
# Writes <outdir>/<label>.{server.log,check.json,cpu.txt}; metrics land in target/spike-metrics/<label>-game1.json.
set -uo pipefail
cd "$(dirname "$0")/../.."
out="$1"; label="$2"; shift 2
mkdir -p "$out"
./run-spike.sh --wait-client 120 --exit --label "$label" "$@" > "$out/$label.server.log" 2>&1 &
srv=$!
until grep -q "^\[web\] seat 1 (" "$out/$label.server.log"; do
  kill -0 "$srv" 2>/dev/null || { echo "server died"; exit 1; }
  sleep 1
done
sleep 1 # every seat line is out
token=$(grep 'serving http' "$out/$label.server.log" | grep -o 'token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)
seat_tokens=$(grep '^\[web\] seat ' "$out/$label.server.log" | sed -E 's/^\[web\] seat ([0-9]+) .*token=([A-Za-z0-9_-]+).*/\1=\2/' | paste -sd,)
java_pid=$(pgrep -P "$srv" java || echo "$srv")
(
  hz=$(getconf CLK_TCK); prev=0
  while kill -0 "$java_pid" 2>/dev/null; do
    t=$(awk '{print $14+$15}' "/proc/$java_pid/stat" 2>/dev/null) || break
    rss=$(awk '/VmRSS/{print $2}' "/proc/$java_pid/status" 2>/dev/null)
    [ "$prev" -gt 0 ] && echo "cpu% $(( (t - prev) * 100 / hz / 2 )) rssKB $rss"
    prev=$t; sleep 2
  done
) > "$out/$label.cpu.txt" &
node spike-viewer/check/ws-check.mjs --token "$token" --seat-tokens "$seat_tokens" --timeout 3000 --viewers "${VIEWERS:-spectator}" > "$out/$label.check.json"
rc=$?
wait "$srv"
echo "check exit=$rc"
exit $rc
