# Per-game stats from a `forge sim` log (not quiet): turns, duration, spells cast, abilities activated, attack declarations.
/^Add To Stack: .* cast /      { cast++ }
/^Add To Stack: .* activated / { act++ }
/^Add To Stack: .* triggered / { trig++ }
/^Land: /                      { land++ }
/^Combat: .* assigned .* to attack / { atk++ }
/^Combat: .* (blocked|didn't block) / { blk++ }
/^Game Outcome: Turn /         { turns = $NF }
/^Game Result: /               {
  match($0, /ended in [0-9]+ ms/); ms = substr($0, RSTART + 9, RLENGTH - 12)
  n++; printf "game %d: %5.1f s, %3d turns, cast %3d, activated %3d, triggered %3d, lands %3d, attackers %3d, block lines %3d\n", n, ms/1000, turns, cast, act, trig, land, atk, blk
  T += ms; TT += turns; C += cast; A += act; G += trig; K += atk
  cast = act = trig = land = atk = blk = 0
}
END { if (n) printf "mean over %d games: %.1f s, %.1f turns, %.1f casts, %.1f activations, %.1f triggers, %.1f attackers\n", n, T/n/1000, TT/n, C/n, A/n, G/n, K/n }
