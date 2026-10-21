#!/usr/bin/env bash
# Run only the gates that this branch's changes require, compared with $BASE
# (default origin/develop). Committed, staged, unstaged and untracked files count.
set -uo pipefail
base=${BASE:-origin/develop}
changed=$( { git diff --name-only "$(git merge-base "$base" HEAD)" HEAD
             git diff --name-only HEAD
             git ls-files --others --exclude-standard; } | sort -u)
upstream='^(forge-core|forge-game|forge-ai|forge-gui|forge-gui-desktop)/|^pom\.xml$'
rc=0; ran=0
run() { ran=1; make --no-print-directory "$1" || rc=1; }
if grep -qE '^fork-web/frontend/' <<<"$changed"; then run web-front-check; fi
if grep -qE '^fork-web/(pom\.xml|src/)' <<<"$changed" || grep -qE "$upstream" <<<"$changed"; then run web-java-test; fi
if grep -qE '^fork-desktop-web/|^fork-web/(pom\.xml|src/main/)' <<<"$changed" || grep -qE "$upstream" <<<"$changed"; then run web-desktop-test; fi
if grep -qE "$upstream" <<<"$changed"; then run desktop-test; fi
[ "$ran" -eq 0 ] && echo "No gate needed for these changes (docs or config only)."
echo "== check: exit $rc"
exit "$rc"
