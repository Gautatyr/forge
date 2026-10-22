# Playing a Commander game in the new match screen

Forge's desktop app, with the match itself in your browser. You set the game up in Forge's normal lobby, with your own decks.

## For friends (installed app, no terminal)
- **Download:** the installer for your system from the project's Actions page (workflow `fork-package`, artifact `forge-fork-<system>`), or from the person who runs the project. Linux: `.deb` or `.tar.gz`; Windows: `.msi`; macOS: `.dmg`.
- **Install:** Windows/macOS: open the installer. The builds are unsigned: Windows SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**. macOS blocks the app on first open: System Settings, Privacy & Security, **Open Anyway** (the `.dmg` is built for Apple Silicon Macs only, not Intel). Linux `.deb`: `sudo apt install ./forge*.deb`; `.tar.gz`: extract anywhere. Java is included.
- **Start:** open **Forge** from your applications menu (`bin/Forge` in the extracted folder). Forge's window opens; set up a game as in [Set up the game](#set-up-the-game) and press **Start**: your browser opens the match.
- **Decks:** `.dck` files go in `decks/commander/` of Forge's data folder (Linux `~/.forge`, Windows `%APPDATA%\Forge`, macOS `~/Library/Application Support/Forge`), or build them in Forge's deck editor. Same folders as any Forge install.
- **Back to the Swing screen:** untick **Use the new match screen** ([The toggle](#the-toggle)).
- Build the installer yourself: `make package` on the OS you want (JDK 17 with `jpackage`, Maven, Node, pnpm; Windows: also WiX, from Git Bash). Output: `target/package/`.

## Start
From the repository root, on `develop`:

```fish
git pull
make play
```

`make play` rebuilds the match screen and Forge every time (the first run takes a few minutes), then opens Forge's desktop window. You need JDK 17, Maven, Node and pnpm (see [README.md](README.md#development-setup)).

## The toggle
In Forge's top menu bar, between the tabs and the window buttons, there is a checkbox **Use the new match screen**. It is on by default and Forge remembers it.

- On: a match you start from the lobby opens in the browser.
- Off: the match opens in Forge's usual Swing screen.

## Set up the game
1. In the left menu, open **Constructed**.
2. Under **Variants**, tick **Commander**. Starting life becomes 40.
3. Click **Add a Player** until there are 4 players.
4. Player 1 is you (**Human**). Set the other three to **AI**.
5. Pick a deck for each player: yours from your Commander decks, and decks (or random generated Commander decks) for the AIs.
6. Press **Start**.

Your browser opens the match screen on its own. If the page is already open from an earlier game, it switches to the new game instead and no new tab opens. If no browser opens, start with `make play ARGS="--no-browser"`: the terminal prints the link (`http://127.0.0.1:…/?live=1&seat=0#token=…`). Open it, and keep it to yourself: the token in it lets anyone on your computer play your seat.

When the game ends, the page shows the result and Forge's lobby is ready for the next Start. Closing the browser tab does not end the game: reopen the link within a minute. After a minute without the page (or 15 minutes without an answer), a pending question gets Forge's default answer, and the game goes on.

## What works
Checked on a 4-player Commander game (you plus 3 AIs, 40 life) started from the lobby:
- Mulligan (keep or mulligan), land drops, casting spells and your commander from the command zone (with commander tax).
- Mana payment: click your lands and mana rocks one by one, or **Pay automatically**; the plan shows which sources it would tap. Floating mana is used by **Pay automatically**.
- Attacks: click your creatures, then **Attack with N** (or **Attack all**); click an opponent, planeswalker or battle first to change what they attack.
- Prompts: yes/no questions (for example, sending your commander back to the command zone) and cards an opponent reveals to you. Blocks, targets and library searches were checked in earlier test games, not in this one.
- Discard to hand size at the end of your turn: click the cards in your hand, then **OK**.
- **To my turn** passes until your next turn; it stops when the game asks you something.
- Card images come from Forge's own image cache (the same pictures as the desktop app, tokens included); a card Forge has no picture for comes from Scryfall.
- Reloading the page or a short disconnect resumes where you were, open questions included.
- Conceding (**Game** menu) ends your part; the AIs play on to the end, then Forge's lobby is ready again.

## Known limitations
- One game per match: the lobby's "games per match" setting is ignored in the new screen.
- Only lobby games with exactly one human player open in the browser. Quest, gauntlet, draft, puzzle and hotseat games stay in the Swing screen.
- Floating mana can't be clicked on its own while paying; **Pay automatically** uses it.
- Text is English only.
- Seen once, not yet explained: Szarekh, the Silent King's attack trigger (mill three) did not trigger in our test game. If an attack trigger seems missing, compare with the Swing screen (toggle off) and tell us.
- Phase stops (the **Stops** panel) and display settings are kept by the browser, per computer.

## Back to the Swing screen
Untick **Use the new match screen** in Forge's menu bar, then press **Start**: the match opens in Forge's usual screen. This needs no restart. To run upstream's plain desktop app instead, build and run `forge-gui-desktop` as described in [README.md](README.md#development-setup).
