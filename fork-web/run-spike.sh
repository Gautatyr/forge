#!/usr/bin/env bash
# Runs the web-bridge spike server from fork-web/. Build first (from the repo root):
#   mvn -pl fork-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
# Then e.g.:  ./run-spike.sh --mode commander --speed fast
set -euo pipefail
cd "$(dirname "$0")"
CP="target/classes:$(cat target/cp.txt)"
exec java -Xmx2g -cp "$CP" forge.fork.web.WebMain "$@"
