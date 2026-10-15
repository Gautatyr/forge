# Audit: desktop Swing UI (forge-gui-desktop)

> Archived agent report, 2026-10-15. Baseline commit `0b0f7ecc511` (upstream/master at the time).

# forge-gui-desktop UI audit

Read-only audit. Nothing was modified (`git status` is clean), and no report file was written because you asked for none. The repo has no CLAUDE.md. The fork's issue tracker is disabled, so I searched upstream: nothing open on FlatLaf, HiDPI or a desktop UI rework. The closest is #3380, "4K 150% scaling issue with GUI deck viewer", which is closed.

The ~547 files / ~119k lines you quoted include tests. Production code is **409 files and 90,284 lines**; tests are 138 files and 29,003 lines.

In the paths below, `D/` means `forge-gui-desktop/src/main/java/forge/` and `G/` means `forge-gui/src/main/java/forge/`.

## Verdict first
A FlatLaf restyle can modernise the look in a contained way, because every visual goes through one class, `FSkin`. It cannot fix the structural UX problems: fixed docking slots, singleton screens, and image decoding on the UI thread.

A rewrite on another toolkit is realistic for the **match screen only**. The seam there is clean and the mobile client already proves it. The rest of the app (home, deck editor, item manager: about 40k lines) has **no shared controller layer**, so it would all be rewritten from scratch. On top of that, you would be porting upstream's UI changes forever: 231 upstream commits touched `forge-gui-desktop/src/main` in the last 12 months, 48 of them on `CMatchUI`, and `IGuiGame` changed 33 times.

Ranked options:
1. **Reskin in place (recommended first step).** Replace FSkin's back end with FlatLaf plus SVG icons, keep FSkin's API, and drop the hand-rolled window chrome. Cost is medium. It conflicts little with upstream because the changes stay inside about five files.
2. **New match screen on the `IGuiGame` seam, keep Swing for the rest.** Biggest UX payoff where users spend their time. Cost is high, and you take on the porting tax for `CMatchUI`.
3. **Full rewrite on a new toolkit.** Only worth it if you accept forking away from upstream's UI. There is also a third route already in the tree: the libGDX UI runs on desktop through `forge-gui-mobile-dev`, which depends on `gdx-backend-lwjgl3`.

## 1. UI technology and age
- **Look-and-feel is forced to Metal.** `D/toolbox/FSkin.java:1715` sets `MetalLookAndFeel`, then about 60 `UIManager.put` overrides follow (from line 1694). No FlatLaf or other modern look-and-feel is a dependency; the only UI libraries are `miglayout-swing` 4.2 and `java-image-scaling` 0.8.6 (`forge-gui-desktop/pom.xml:323,328`).
- **The skin is raster sprites addressed by pixel coordinates.** `G/localinstance/skin/FSkinProp.java` holds 480 `int[]` coordinate entries.
  - Even the theme colours are sampled from sprite pixels: `CLR_THEME` is pixel (70,10) (`FSkinProp.java:54`), read by `getRGB` at `FSkin.java:472`. Progress-bar colours are read the same way (`FSkin.java:1208-1211`).
  - There are no theming tokens. Only one skin ships (`forge-gui/res/skins/default`, 18 MB).
- **Sprites are 1x raster.** `sprite_icons.png` is 680×1920 and `sprite_buttons.png` is 484×2048. Buttons are 3-slice images (`D/toolbox/FButton.java:80-82,118-161`).
- **FSkin is a 3,117-line god class.** It mixes the look-and-feel, fonts, sprite loading and 15+ `Skinned*` component subclasses (from `FSkin.java:2008`). It is referenced by 161 files, with 1,306 `FSkin.*` call sites.
- **Fonts.** One TTF per skin (`FSkin.java:1337`), scaled by a single integer preference (`UI_DEFAULT_FONT_SIZE`, `FSkin.java:1335`) using a `relative/12` multiplier (`FSkin.java:957-965`).
- **HiDPI is minimal.**
  - `GuiDesktop.getScreenScale()` reads the default transform (`D/GuiDesktop.java:421-424`). It is used in only 7 places, mostly for 18px icons and card images.
  - There is no `sun.java2d.uiScale` in the launch arguments (`pom.xml:20`).
  - On 2x screens, the raster sprites are upscaled by the JDK.
- **Custom windows, layout and animation.**
  - Hand-rolled window chrome: `setUndecorated(true)` in `D/view/FFrame.java:48` and `D/view/FDialog.java:89`, with manual resize borders (`FFrame.java:374-400`) and manual maximise/full-screen handling.
  - 88 `paintComponent`/`paint` overrides, 11 `setLayout(null)`, 84 `setBounds`, 268 `new MigLayout`, and 383 hard `px` constraints.
  - Animations use `java.util.Timer`, not a Swing timer (`D/view/arcane/util/Animation.java:43`, `D/gui/framework/SDisplayUtil.java:93`).

In code terms it does look outdated: hand-rolled components, image-based skin, no tokens, minimal HiDPI support.

## 2. Architecture
- **Global state.**
  - `D/Singletons.java` holds the static `FView` and `FControl`.
  - 191 `SINGLETON_INSTANCE;` declarations (enum singletons), with 1,028 references.
  - `Singletons.getView()`/`getControl()` appear 136 times across 54 files; `FModel.` is used in 119 files.
- **Docking ("drag cell") framework.** `D/gui/framework` is 3,139 lines. `EDocID` statically binds docs to singleton views (`EDocID.java:49-59`) and hard-codes 8 player slots (`FIELD_0..7`, `HAND_0..7`, lines 103-120). Layouts are fractional-rectangle XML files (`forge-gui/res/defaults/match.xml`).
- **God classes.**
  - `D/screens/match/CMatchUI.java` (1,814 lines) extends `NetworkGuiGame` and implements `ICDoc` and `IMenuProvider`. It is the `IGuiGame` implementation, the docking controller and the menu provider in one class, with 66 `@Override`s and 17 `forge.game.*` imports.
  - Also: `VLobby` (1,443), `VSubmenuPreferences` (1,397), `PlayArea` (1,318).
- **Coupling to the engine.** 124 files import `forge.game.*`. Most use `*View` classes, but 10 import the live model class `forge.game.card.Card`, for example `Card.getCardForUi(pc)` at `CMatchUI.java:1659` and `view/arcane/CardPanel.java:678`. 13 of the 27 match and arcane view files reference `CMatchUI` directly.

**Interfaces a replacement must implement:**
- `G/gui/interfaces/IGuiBase.java`: 44 methods (threading, dialogs, audio, images, `getNewGuiGame`, `showSpellShop`, `showBazaar`).
- `G/gui/interfaces/IGuiGame.java`: 79 methods. In practice you extend `G/gamemodes/match/AbstractGuiGame.java` (974 lines) or `G/gamemodes/net/NetworkGuiGame.java` (643 lines).
- Smaller adapters: `ILobbyView`, `IWinLoseView`, `IDraftEventHandler`, `IProgressBar`, `IButton`, `ITextField`, `IComboBox`, `ICheckBox`. These are implemented today by `VLobby`, `ViewWinLose`, `CLobby`, `FButton`, `FLabel` and others.

The seam is proven: `forge-gui-mobile/src/forge/GuiMobile.java` and `MatchController.java` (966 lines) implement the same two interfaces.

## 3. Threading
- **Counts:** `SwingUtilities.invokeLater` ×122, `FThreads.invokeInEdtNowOrLater` ×27, `invokeInEdtAndWait` ×10, but only 20 `assertExecutedByEdt` checks.
- **The game thread blocks on modal dialogs** through `invokeInEdtAndWait` (`D/gui/GuiChoose.java:215,265,289`, `D/toolbox/FOptionPane.java:92,148`, `CMatchUI.java:1212,1227`). This is the design, and `GuiDesktop.java:110` guards against re-entry from the UI thread.
- **Verified Swing mutation from the game thread.** The input queue notifies its observers on the calling (game) thread. The chain is:
  - `G/gamemodes/match/input/InputProxy.java:64-65` calls `setCurrentPlayer`
  - `AbstractGuiGame.java:100`
  - `CMatchUI.updateCurrentPlayer`, `CMatchUI.java:328`
  - `CDev.update`, `D/screens/match/controllers/CDev.java:191`
  - which ends at `VDev.update` calling `setToggled` (`D/screens/match/views/VDev.java:141`) and `DevModeMenu` calling `setSelected` (`D/screens/match/menus/DevModeMenu.java:70`), both off the UI thread.
- **Disk decode on the UI thread.** `ImageCache.getImage` asserts it runs on the UI thread (`D/ImageCache.java:624`), and a cache miss decodes the file with `ImageIO.read` (`D/ImageLoader.java:32`). `ImageView` calls this from `paintComponent` (`D/itemmanager/views/ImageView.java:1007` → `1113` → `1165`).
- **Race in the "remind" flash animation.** Static fields are mutated on a `java.util.Timer` thread and read in `invokeLater` lambdas (`SDisplayUtil.java:31-33,72-90`). The timer thread nulls `newR` while queued lambdas check it and then dereference it.
- **Minor, not verified:** `AudioClip.play` sleeps 30 ms (`D/sound/AudioClip.java:81,133`). I did not confirm which thread calls it.

## 4. Code quality
- **Top 15 files by line count:** FSkin 3,117; CMatchUI 1,814; VLobby 1,443; VSubmenuPreferences 1,397; PlayArea 1,318; ItemManager 1,299; ImageView 1,292; CardPanel 1,183; FCardImageRenderer 1,167; PlayerPanel 1,016; ImportDialog 987; DeckImport 973; FDeckChooser 928; CSubmenuPreferences 870; FloatingZone 847.
- **Markers:** 72 TODO, 4 FIXME, 2 HACK. 65 `System.out.print*` and 36 `System.err.print*` calls. 199 `@SuppressWarnings`, 156 of them `"serial"`.
- **Swallowed exceptions:** 24 empty catch blocks and 22 catches that only call `printStackTrace` (49 `printStackTrace` calls in total). Examples: `catch (final Exception e) { }` four times in `D/gui/framework/DragCell.java:171-210`, plus `D/screens/home/CHomeUI.java:106` and `D/toolbox/special/CardZoomer.java:318`.
- **Deprecated APIs:** `java.util.Observable`/`Observer` (`D/screens/match/controllers/CLog.java`, `CMatchUI.java:1237`; in forge-gui, `InputQueue` and `InputProxy`).
- **Duplication with mobile:** 79 class names exist in both modules.
  - Filter predicates are already shared through `SFilterUtil`, so that part was done right.
  - Rules logic is still duplicated: `getDamageToKill` exists in both `D/screens/match/VAssignCombatDamage.java:459` and `forge-gui-mobile/src/forge/screens/match/views/VAssignCombatDamage.java:447`.
  - `FDeckChooser` (928 vs 1,525 lines), `ItemManager` (1,299 vs 1,287) and `ControlWinLose` (70 differing lines) are parallel implementations.

## 5. Concrete UX/UI bugs and smells
1. **Copy-paste bug:** `SDisplayUtil.java:78` computes alpha from the red array (`newA == null ? oldA : newR[counter]`). `newG` and `newB` are computed but never used.
2. **Image cache is flushed on every screen switch** (`D/control/FControl.java:339`). Combined with the UI-thread decode in §3, every navigation re-reads card images on the UI thread.
3. **Image cache size is a count, not a memory budget.** It holds up to 400 entries (`ImageCache.java:84`, default in `ForgePreferences.java:41`), and every width×height variant is its own entry (`ImageCache.java:545`). Resizing or zooming churns the cache and memory use is unpredictable.
4. **Undisposed `Graphics` objects:** `FSkin.java:1073` calls `getFrame().getGraphics()` on every `getFontMetrics` call and never disposes the result.
5. **Fixed pixel sizes that ignore font scaling,** for example `VField.java:137,261-299` (`h 20px!` for life labels).
6. **Magic colours:** 78 `new Color(r,g,b)` literals in 31 files, plus 101 `Color.RED`-style constants. For example, zone colours at `CardPanel.java:100-105` bypass the skin entirely.
7. **Listeners:** 531 add-listener calls against 29 removals. Most are on singletons that live forever, so the leak risk is mainly on per-match objects. I did not prove a specific leak.

## 6. Tests
- **No test covers a Swing component.** 555 `@Test` methods; 237 of them under `forge/ai`.
- What exists is AI, engine and simulation tests, network-protocol tests (`net/`), and deck-generation tests. They live here only because they need a `GuiBase` implementation (`GuiBase.setInterface(new GuiDesktop())` in `ai/AITest.java:41`; `net/HeadlessGuiDesktop.java`).
- The only UI-flavoured tests are hollow:
  - `GuiProgressBarWindowTest` has its body commented out.
  - `PanelTest` is `enabled = false`.
  - `HeadlessStartupTest` checks that the app starts without a display, not anything about the UI.
- `D/view/Main.java:103-111` also hosts the `sim`, `parse` and `server` command-line modes. A replacement UI must either keep them or move them.

## 7. Smallest seam
A new UI needs `IGuiBase` plus a subclass of `NetworkGuiGame` (for the match screen), and `ILobbyView` and `IDraftEventHandler` (for the lobby). That is enough to play games.

What it does **not** give you is deck editor, quest, gauntlet or settings screens: those live entirely in Swing classes (`screens/home` 19,954 lines, `screens/deckeditor` 11,298, `itemmanager` 8,910).

**Reskin path:** keep FSkin's public API and replace its internals.
- Install FlatLaf instead of Metal at `FSkin.java:1715`.
- Map the `FSkin.Colors` enum (`FSkin.java:413`) to FlatLaf tokens.
- Swap sprite icons for SVG.
- Delete the custom chrome in `FFrame`/`FDialog`.
- Fix the UI-thread image decode and the cache flush (§5.2–5.3) at the same time.

## Evidence gaps
- No GUI was run. Nothing visual (blurriness at 2x, resize breakage, performance) was observed on screen; those points are inferred from code.
- The `AudioClip` sleep's calling thread was not traced.
- The listener-leak point is a ratio, not a demonstrated leak.
- I did not measure how much code would actually change in a FlatLaf swap.

Key files:
- forge-gui-desktop/src/main/java/forge/toolbox/FSkin.java
- forge-gui-desktop/src/main/java/forge/screens/match/CMatchUI.java
- forge-gui-desktop/src/main/java/forge/GuiDesktop.java
- forge-gui-desktop/src/main/java/forge/ImageCache.java
- forge-gui-desktop/src/main/java/forge/gui/framework/SDisplayUtil.java
- forge-gui/src/main/java/forge/gui/interfaces/IGuiGame.java
- forge-gui/src/main/java/forge/gui/interfaces/IGuiBase.java
- forge-gui/src/main/java/forge/localinstance/skin/FSkinProp.java
