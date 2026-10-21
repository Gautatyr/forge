---
name: product-context
description: Forge-fork product sources for the `product` agent — who decides, the rulings log to read first, the design memo and specs, and where to see the current match-screen mockup. Preloaded by the product agent.
---

## Who decides

Hugo is the project lead and product owner. The `product` agent settles small calls that
follow an existing ruling and prepares a decision memo for Hugo on everything else. The
orchestrator records every settled call and every Hugo ruling.

## Read first, every time

`docs/fork/design/match-screen-decisions.md`: Hugo's rulings on the match screen, with
dates and sources. It outranks generic good taste. `docs/fork/decisions.md` holds the
project-level decisions (web UI, multiplayer first, no upstream interaction).

Recorded taste so far: multiplayer first (Commander, 3–4 players); clarity before polish;
a hand of up to 9 cards fully readable; colour-blind friends (shape + colour on every
state); English and French; manual mana payment by default, auto-pay a toggle; auto-pass
and auto-yield off by default; light customisation, never a docking workspace; card art
must be admirable in game.

## Product sources

| Source | What it holds |
|---|---|
| `docs/fork/design/match-screen-memo.md` | interaction inventory, pain points of the Swing screen, benchmarks, principles, decisions D1–D11 |
| `docs/fork/design/product-decisions-pass-3.md` | turn strip and stops, mana payment, keyword icons, card sizing; engine facts at the end |
| `docs/fork/design/mockup-review-1.md` | Hugo's first review of the mockup |
| `docs/fork/design/mockup-notes.md` | what the mockup contains, its scenarios and design choices |
| `docs/fork/audit/desktop-ui.md` | the current Swing desktop UI |
| `docs/User-Guide.md`, `docs/interface-overview.png` | the Swing client as users see it today |
| Epic on GitHub | `gh issue view 15 -R Gautatyr/forge` (plan and progress) |

## Seeing the current mockup

- Committed renders: `fork-web/frontend/docs/screenshots/*.jpg` (1920×1080 unless
  the name says otherwise; `cb-*` = colour-blind simulation).
- Local full set (may be absent on another machine): `fork-web/frontend/docs/screenshots/*.png`.
- You may view these images; code stays out of scope.
