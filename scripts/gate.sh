#!/usr/bin/env bash
# Run one check, keep its full output in target/gate-logs/<name>.log, and print
# only a short summary plus the command's real exit code.
# Usage: scripts/gate.sh <name> <command> [args...]
set -uo pipefail
name=$1; shift
logdir="$(git rev-parse --show-toplevel)/target/gate-logs"
mkdir -p "$logdir"
log="$logdir/$name.log"
"$@" >"$log" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  grep -E 'Tests run:.*Fail|Test Files|^ +Tests +[0-9]|BUILD SUCCESS|built in' "$log" | tail -n 6
else
  grep -nE '\[ERROR\]|FAIL|Error:|error TS|✗|×' "$log" | head -n 40
  echo "--- last 30 lines of $log ---"
  tail -n 30 "$log"
fi
echo "== $name: exit $rc (full log: $log)"
exit "$rc"
