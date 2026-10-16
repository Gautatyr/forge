# CLAUDE.md — forge-gui-desktop-web

Fork-owned launcher (issue #14): Forge's desktop app with lobby matches in the web match screen.
Depends on `forge-gui-desktop` and `forge-gui-web`; nothing depends on it. Package `forge.web.desktop`.

- `Main`: desktop app start (no Sentry), `GuiDesktopWeb` installed, menu-bar toggle added at runtime.
- `GuiDesktopWeb.hostMatch()` returns a `WebHostedMatch`: on `startMatch`, a Constructed-type match
  (lobby, any variant incl. Commander) with exactly one human and the toggle on gets that human's GUI
  replaced by a `WebGuiGame` seat (seat 0: `HostedMatch` sorts humans first). Other modes stay Swing.
  A web match quits after its game (end-game hook) and hands back to the lobby.
- `WebMatchHost`: one in-process `WebServer` per launch, serving `forge-gui-web/frontend/dist`; per-launch
  tokens (spectator + seats 0–7); opens the seat page (`/#token=…`) when no page is connected.
- `MatchScreenPref`: `<user dir>/preferences/fork-web.preferences`, key `useNewMatchScreen` (default true).
- `LobbyRun`: headless check of the same path (`LocalLobby` → Start), isolated profile.

## Gates and running
- `make web-desktop-test` (this module's tests only); `make check` picks it up.
- `make play` (ARGS="--no-browser" to print the URL): builds the frontend and modules, runs `run.sh`.
- End-to-end: `forge-gui-desktop-web/check/lobby-run.sh <outdir> <label> --players 4 [--deck0 file.dck]`
  (scripted seat 0 via `human-seat.mjs`, `VIEWERS=spectator,1,2,3` for `ws-check.mjs`; exit 0 = passed).
- Never run `Main` against `~/.forge` from tooling: set `JAVA_TOOL_OPTIONS=-Duser.home=<scratch dir>`.
