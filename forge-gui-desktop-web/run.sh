#!/usr/bin/env bash
# Starts Forge's desktop app with the web match screen (forge.web.desktop.Main), from forge-gui-desktop-web/.
# Build first (from the repo root): make play, or
#   mvn -pl forge-gui-desktop-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
# MAIN=forge.web.desktop.LobbyRun runs the headless lobby check instead (see check/lobby-run.sh).
set -euo pipefail
cd "$(dirname "$0")"
CP="target/classes:$(cat target/cp.txt)"
# JVM flags of forge-gui-desktop's launcher (its pom: mandatory.java.args, addopen.java.args)
exec java -Xmx4096m -Dio.netty.tryReflectionSetAccessible=true -Dfile.encoding=UTF-8 \
  --add-opens java.desktop/java.beans=ALL-UNNAMED --add-opens java.desktop/javax.swing.border=ALL-UNNAMED \
  --add-opens java.desktop/javax.swing.event=ALL-UNNAMED --add-opens java.desktop/sun.swing=ALL-UNNAMED \
  --add-opens java.desktop/java.awt.image=ALL-UNNAMED --add-opens java.desktop/java.awt.color=ALL-UNNAMED \
  --add-opens java.desktop/sun.awt.image=ALL-UNNAMED --add-opens java.desktop/javax.swing=ALL-UNNAMED \
  --add-opens java.desktop/java.awt=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED \
  --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.lang.reflect=ALL-UNNAMED \
  --add-opens java.base/java.text=ALL-UNNAMED --add-opens java.desktop/java.awt.font=ALL-UNNAMED \
  --add-opens java.base/jdk.internal.misc=ALL-UNNAMED --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
  --add-opens java.base/java.nio=ALL-UNNAMED --add-opens java.base/java.math=ALL-UNNAMED \
  --add-opens java.base/java.util.concurrent=ALL-UNNAMED --add-opens java.base/java.net=ALL-UNNAMED \
  -cp "$CP" "${MAIN:-forge.web.desktop.Main}" "$@"
