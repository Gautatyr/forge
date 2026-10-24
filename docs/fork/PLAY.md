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

When the game ends, the page shows the result: **Back to lobby** (Enter) or **View the board** (Esc). Forge's lobby is ready for the next Start. The next Start shows its game in the same open page, whether you left the result open or pressed **Back to lobby**; no reload.

Closing the browser tab does not end the game: reopen the link within a minute. After a minute without the page (or 15 minutes without an answer), a pending question gets Forge's default answer, and the game goes on.

A tab left open from an earlier launch of Forge cannot rejoin: it stays frozen on its last view. Close it and use the page the new launch opens.

### Saved settings
The page lives at `http://127.0.0.1:47321/` (a fixed port), so the browser keeps your settings between launches on the same computer and browser: stops (except the rows from "Set per opponent", which last one game: the next game starts without them, and a reload drops them too), language, display options, Auto-pay and the switches in the Stops panel.

If port 47321 is taken (a second Forge open at the same time), that Forge uses a free port and its page starts from default settings, stored apart. `make play ARGS="--port 9000"` picks the port yourself.

## What works
Checked on 4-player Commander games (you plus 3 AIs, 40 life) started from the lobby:
- Mulligan (keep or mulligan), land drops, casting spells and your commander from the command zone (with commander tax).
- Cards you may play from another zone (the top of your library with Mystic Forge or Bolas's Citadel, flashback, escape, foretell, adventure, impulse draw, an opponent's exiled or in-hand card you may cast, with mana of any type or not) sit in a group beside your hand with their zone; click one to cast or play it. Clicking a permanent with nothing you can activate now does nothing (no message).
- Mana payment: click your lands and mana rocks one by one, or **Pay automatically**; the plan shows which sources it would tap. Floating mana shows above the prompt: while you pay, click a floating symbol that still helps to spend it, or let **Pay automatically** use it.
- Attacks: click your creatures, then **Attack with N** (or **Attack all**); click an opponent, planeswalker or battle first to change what they attack.
- Blocks, targets, library searches, "may" triggers, trigger ordering, X costs, coin flips, ability menus, yes/no questions and cards an opponent reveals to you.
- Discard to hand size at the end of your turn: click the cards in your hand, then **OK**.
- Card images come from Forge's own image cache (the same pictures as the desktop app, tokens included); a card Forge has no picture for comes from Scryfall. A card with no picture at all (for example Alchemy "A-" cards in generated AI decks) shows as a readable text card in the hover preview.
- In a short window (about 1366x700 and below), choices over many cards show as a compact list when the card tiles do not fit. Hover a row for the card.
- Reloading the page or a short disconnect resumes where you were, open questions included.
- Conceding (**Game** menu) ends your part; the AIs play on to the end, then Forge's lobby is ready again.

## Passing priority and stops
Open **Stops** (the button at the end of the turn-step strip at the top) to choose where the game waits for you, step by step, on your turn and on opponents' turns. The panel also has:
- **Stop only when I'm involved** (off by default): on opponents' turns, stop at declare attackers only when you are attacked, at declare blockers only when you are in the combat, and at the end step only on the turn of the player right before you.
- **Skip spells between opponents** (off by default): don't stop for spells and abilities that neither target nor affect you or your cards. Anything aimed at you or that you control still stops you.
- **Auto-pass when I can't act** (off by default; also `P`): pass automatically when you have nothing you can play.
- **Pass after casting** (off by default): after your own spell or ability goes on the stack, pass priority once so it resolves unless someone responds. Shift + click keeps priority for one cast.
- **Always yielding to:** the list of abilities you set to **Always yield to this** on a stack item (choosing **Always yield to this** turns **Auto-yield on**, the switch in the Stack panel, on by itself; it does nothing while that switch is off). Click the cross on an entry to remove it.

**To my turn** (Shift + Enter) passes for you until your next turn starts, through your stops. Questions the game asks you (a discard, for example) are still asked. It ends early, and you get priority as usual, when an opponent casts a spell or activates an ability, or attacks you. The pass is over then and the button reads **To my turn** again. The normal stops apply again (for example the opponent's end step): to carry on, press Shift + Enter or click **To my turn**.

**Auto-pay mana** (below the main button, remembered) pays a cost at once when you cast or activate, when Forge can pay it. Off by default: you click your lands.

## Keyboard
Press `?` in the game for the full list (also the **Keys** button). The main ones:
- `Space`: the main button (pass, resolve, attack, block, confirm, pay automatically). It never cancels or declines.
- `Esc`: cancel a spell being cast or paid for, clear a pending choice, close panels.
- `Shift + Enter`: pass until my next turn. `Z`: undo (while paying: untap the last land). `A`: attack all. `P`: auto-pass on / off.
- `1`-`9`: pick the Nth option in the choice tray (or the Nth card of your hand). `Y` / `N`: yes / no. `N`: choose none in an optional choice. `M`: mulligan.
- `I`: inspect the hovered card. `V`: peek at the board while a choice is open. `L`: game log. `D`: display options.

## Language
**Display** (`D`), **Language**: English or French. It switches the screen, card names, card text and card images (French pictures come from Scryfall; a card without one keeps its English picture). The page starts in French when the browser's language is French. Lines the engine writes (the game log, some prompts) stay English.

## Known limitations
- One game per match: the lobby's "games per match" setting is ignored in the new screen.
- Only lobby games with exactly one human player open in the browser. Quest, gauntlet, draft, puzzle and hotseat games stay in the Swing screen.
- Scry and surveil with 5 or more cards in one pile may need a sideways scroll to reach every card.

## Back to the Swing screen
Untick **Use the new match screen** in Forge's menu bar, then press **Start**: the match opens in Forge's usual screen. This needs no restart. To run upstream's plain desktop app instead, build and run `forge-gui-desktop` as described in [README.md](README.md#development-setup).
