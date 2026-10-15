#!/usr/bin/env bash
# Print a port derived from the current worktree path, so parallel worktrees never
# collide. Usage: scripts/dev-port.sh <base> (e.g. 5200 for Vite, 7700 for the bridge).
set -euo pipefail
base=${1:?usage: dev-port.sh <base>}
root=$(git rev-parse --show-toplevel)
echo $(( base + $(cksum <<<"$root" | cut -d' ' -f1) % 300 ))
