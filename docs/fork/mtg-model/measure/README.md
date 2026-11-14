# Measurement helpers (2026-11-14)

Throwaway tools behind the numbers in [../README.md](../README.md), section 2. Run them from `forge-gui-desktop/` after
`mvn -o -B -q -pl forge-gui-desktop -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt`.
Use an isolated profile (`-Duser.home=<scratch dir>`) so `~/.forge` is never written.

- Game speed (not quiet, so the game log is printed):
  `java -Duser.home=<scratch> -cp "target/classes:$(cat target/cp.txt)" forge.view.Main sim -f Commander -D ~/.forge/decks/commander -d Kaalia.dck Norn.dck Teysa.dck Zhulodok.dck -n 8 -c 600 -s 42 > sim.log`
  then `awk -f simstats.awk sim.log` (per-game time, turns, spells, activations, triggers, attackers).
- CPU split: add `-XX:StartFlightRecording=filename=sim.jfr,settings=profile,dumponexit=true` (and `-q`), then
  `$JAVA_HOME/bin/jfr print --events jdk.ExecutionSample --stack-depth 200 sim.jfr > samples.txt` and `awk -f jfrsplit.awk samples.txt`.
  A sample counts as "ai" when any `forge.ai.*` frame is on its stack, which includes engine work the AI triggers (~3.6 % of ai samples).
- `infer_bench.py`: numpy transformer forward pass per decision. Only meaningful with an optimised BLAS (the local numpy uses reference `cblas`, ~7 GFLOPS per core).
