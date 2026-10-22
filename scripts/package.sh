#!/usr/bin/env bash
# Fork-owned: builds the self-contained desktop app (jpackage) for the OS this runs on.
#   scripts/package.sh [--no-installer]     output: target/package/{input,image,installer}/
# App image: bundled Java runtime + Forge jars + res/ + built frontend; starts the desktop lobby with the
# web match screen on. Installer: .deb on Linux when dpkg-deb exists (else a .tar.gz of the image),
# .msi on Windows (needs WiX), .dmg on macOS. Never reads or writes ~/.forge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="$ROOT/target/package"
NAME="Forge"
VERSION="${PACKAGE_VERSION:-1.0.0}"   # jpackage wants numeric x.y.z
if ! command -v jpackage >/dev/null; then
  # not on PATH (e.g. Arch): look beside the real java, or in JAVA_HOME
  JBIN="$(dirname "$(readlink -f "$(command -v java)")")"
  for d in "${JAVA_HOME:+$JAVA_HOME/bin}" "$JBIN"; do
    [ -n "$d" ] && [ -x "$d/jpackage" ] && { PATH="$d:$PATH"; break; }
  done
fi
command -v jpackage >/dev/null || { echo "jpackage not found: install a JDK 17+ (not a JRE)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/input/lib" "$OUT/input/web"

echo "== frontend"
(cd fork-web/frontend && pnpm install --frozen-lockfile && pnpm build)
cp -r fork-web/frontend/dist/. "$OUT/input/web/"

echo "== jars"
mvn -B -q -pl fork-desktop-web -am -DskipTests package dependency:copy-dependencies \
  -DincludeScope=runtime -DoutputDirectory="$OUT/input/lib"
cp fork-desktop-web/target/fork-desktop-web-*.jar "$OUT/input/lib/"

echo "== res"
cp -r forge-gui/res "$OUT/input/res"
# adventure mode is not reachable from the desktop lobby: left out (155 MB)
rm -rf "$OUT/input/res/adventure"
cp forge-gui/LICENSE.txt "$OUT/input/"

JOPTS=(--java-options "-Xmx4096m" --java-options "-Dfile.encoding=UTF-8"
  --java-options "-Dio.netty.tryReflectionSetAccessible=true"
  --java-options "-Dforge.assets.dir=\$APPDIR/")
for o in java.desktop/java.beans java.desktop/javax.swing.border java.desktop/javax.swing.event java.desktop/sun.swing \
  java.desktop/java.awt.image java.desktop/java.awt.color java.desktop/sun.awt.image java.desktop/javax.swing \
  java.desktop/java.awt java.base/java.util java.base/java.lang java.base/java.lang.reflect java.base/java.text \
  java.desktop/java.awt.font java.base/jdk.internal.misc java.base/sun.nio.ch java.base/java.nio java.base/java.math \
  java.base/java.util.concurrent java.base/java.net; do
  JOPTS+=(--java-options "--add-opens=$o=ALL-UNNAMED")
done

MAINJAR="$(cd "$OUT/input/lib" && ls fork-desktop-web-*.jar | head -1)"
COMMON=(--name "$NAME" --app-version "$VERSION" --input "$OUT/input" --main-jar "lib/$MAINJAR"
  --main-class forge.fork.desktop.Main --arguments --web-root --arguments "\$APPDIR/web"
  --vendor "Forge (fork)" --description "Forge with the web match screen" "${JOPTS[@]}")

echo "== app image"
jpackage --type app-image --dest "$OUT/image" "${COMMON[@]}"

if [ "${1:-}" = "--no-installer" ]; then
  echo "image: $OUT/image/$NAME"
  exit 0
fi
echo "== installer"
mkdir -p "$OUT/installer"
case "$(uname -s)" in
  Linux)
    if command -v dpkg-deb >/dev/null && command -v fakeroot >/dev/null; then
      jpackage --type deb --dest "$OUT/installer" "${COMMON[@]}" --linux-shortcut
    else
      echo "dpkg-deb/fakeroot missing: tarball instead of .deb"
      tar -C "$OUT/image" -czf "$OUT/installer/forge-fork-linux.tar.gz" "$NAME"
    fi ;;
  Darwin) jpackage --type dmg --dest "$OUT/installer" "${COMMON[@]}" ;;
  MINGW*|MSYS*|CYGWIN*) jpackage --type msi --dest "$OUT/installer" "${COMMON[@]}" --win-menu --win-shortcut --win-dir-chooser ;;
esac
ls -lh "$OUT/installer"
du -sh "$OUT/image/$NAME"
