#!/usr/bin/env bash
# Card-pool sweep (fork-web test forge.fork.web.seat.HumanSeatSweep): full games with a scripted human web seat
# against AIs, strict mode (silent defaults fail). Shards run in parallel JVMs.
# Usage: scripts/web-sweep.sh [-Dforge.web.sweep.<prop>=<value>...]   (props: HumanSeatSweep javadoc)
# Env: SHARDS (default 4); OWNER_DECKS: Commander decks the seat plays first, read only
#      (default ~/.forge/decks/commander when it exists; "none" to skip).
# Writes fork-web/target/sweep/{shard-I.log,report-IofN.json,summary.txt}. Exit 0 = every game passed.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
mvn -B -q -pl fork-web -am test-compile dependency:build-classpath \
  -Dmdep.includeScope=test -Dmdep.outputFile=target/test-cp.txt || exit 1
cd fork-web || exit 1
cp="target/test-classes:target/classes:$(cat target/test-cp.txt)"
shards=${SHARDS:-4}
owner=${OWNER_DECKS:-$HOME/.forge/decks/commander}
props=()
if [ "$owner" != none ] && [ -d "$owner" ]; then props+=("-Dforge.web.sweep.ownerDecks=$owner"); fi
opens=(--add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED
       --add-opens java.base/java.text=ALL-UNNAMED --add-opens java.base/java.time=ALL-UNNAMED)
rm -rf target/sweep && mkdir -p target/sweep
pids=()
for ((i = 0; i < shards; i++)); do
  java -Xmx3g "${opens[@]}" "${props[@]}" "$@" "-Dforge.web.sweep.shard=$i/$shards" -cp "$cp" \
    org.testng.TestNG -d "target/sweep/testng-$i" -testclass forge.fork.web.seat.HumanSeatSweep > "target/sweep/shard-$i.log" 2>&1 &
  pids+=($!)
done
rc=0
for i in "${!pids[@]}"; do
  wait "${pids[$i]}" || { rc=1; echo "shard $i failed: fork-web/target/sweep/shard-$i.log"; }
done
grep -h '^\[sweep\] game ' target/sweep/shard-*.log | grep -F FAILED
java -cp "$cp" forge.fork.web.seat.HumanSeatSweep target/sweep || rc=1
echo "== web-sweep: exit $rc (summary: fork-web/target/sweep/summary.txt)"
exit "$rc"
