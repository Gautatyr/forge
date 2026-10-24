# CLAUDE.md — fork-desktop-web

Fork-owned launcher (issue #14): Forge's desktop app with lobby matches in the web match screen.
Depends on `forge-gui-desktop` and `fork-web`; nothing depends on it. Package `forge.fork.desktop`.

- `Main`: desktop app start (no Sentry), `GuiDesktopWeb` installed, menu-bar toggle added at runtime
  (`MatchScreenToggle.Placement` wraps the bar's SpringLayout: between the tabs and the window buttons).
- `GuiDesktopWeb.hostMatch()` returns a `WebHostedMatch`: on `startMatch`, a Constructed-type match
  (lobby, any variant incl. Commander) with exactly one human and the toggle on gets that human's GUI
  replaced by a `WebGuiGame` seat (seat 0: `HostedMatch` sorts humans first). Other modes stay Swing.
  A web match quits after its game (end-game hook) and hands back to the lobby.
  A match started while a web match runs ends that one first (`WebHostedMatch.supersede`); the ended match
  does not hand back to the lobby.
- `WebMatchHost`: one in-process `WebServer` per launch, serving `fork-web/frontend/dist` and card images
  (`/img`, Forge's image cache via `ForgeImages`); per-launch tokens (spectator + seats 0–7); opens the seat page
  (`/?live=1&seat=N#token=…`, the frontend's live source) when no page is connected.
- The web seat turns on actionable highlights and the autotap preview for itself (`WebGuiGame`, `YieldController`
  overrides); the desktop preferences are not changed.
- `WebMatchAudio` (installed by `Main`): sounds from the web seat's game events (`WebSeats.setEventSink` →
  `SoundSystem.receiveEvent`, as a Swing match's `FControlGameEventHandler`); during a web match the music
  resumes after `FFrame` pauses it on focus loss (the browser has focus); back in the lobby, menu music, paused
  if Forge's window is not focused.
- `MatchScreenPref`: `<user dir>/preferences/fork-web.preferences`, key `useNewMatchScreen` (default true).
- `LobbyRun`: headless check of the same path (`LocalLobby` → Start), isolated profile.
- Packaging (`make package`, `scripts/package.sh`, decision 2026-10-22): the packaged app sets `-Dforge.assets.dir=$APPDIR/`
  (`GuiDesktopWeb.getAssetsDir`; `LobbyRun` honours it too) and `--web-root $APPDIR/web`. jpackage's Linux runtime has no
  `bin/java`: check a package by running `LobbyRun` with system `java` and `-cp 'Forge/lib/app/lib/*'`.

## Gates and running
- `make web-desktop-test` (this module's tests only); `make check` picks it up.
- `make play` (ARGS="--no-browser" to print the URL): builds the frontend and modules, runs `run.sh`. Owner's guide: `docs/fork/PLAY.md`.
- Live play without Swing: `MAIN=forge.fork.desktop.LobbyRun fork-desktop-web/run.sh --wait-client 900 --players 4 [--deck0 file.dck]`,
  then open the printed seat 0 URL in a browser.
  `--games N --game-gap S` plays N matches in a row on the same server and page (check that an open page switches to the next game).
- End-to-end: `fork-desktop-web/check/lobby-run.sh <outdir> <label> --players 4 [--deck0 file.dck]`
  (scripted seat 0 via `human-seat.mjs`, `VIEWERS=spectator,1,2,3` for `ws-check.mjs`; exit 0 = passed).
- Never run `Main` against `~/.forge` from tooling: set `JAVA_TOOL_OPTIONS=-Duser.home=<scratch dir>`.
