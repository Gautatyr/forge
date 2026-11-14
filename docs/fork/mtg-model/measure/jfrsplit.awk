# Summarise `jfr print --events jdk.ExecutionSample --stack-depth 200` output.
# Each sample is classified by the frames on its stack (inclusive):
#   ai      : any forge.ai.* frame (the AI deciding, including rules code it calls to evaluate options)
#   engine  : forge.game.* frames but no forge.ai.* frame (rules engine running the game)
#   startup : card database / script loading (forge.card*, CardStorageReader, StaticData) without game frames
#   other   : anything else (JVM, logging, UI glue)
# Also counts the top (self) frame's class for engine-only and ai samples.
function flush() {
  if (!inev) return
  cls = "other"
  if (hasai) cls = "ai"; else if (hasgame) cls = "engine"; else if (hasload) cls = "startup"
  n[cls]++; total++
  if (top != "") { split(top, p, "("); m = p[1]; sub(/\.[^.]+$/, "", m); self[cls " " m]++ }
  # engine time spent under static-ability / layer recomputation, and under state-based actions
  if (hasstatic) st[cls]++
  if (hascopy) cp[cls]++
  inev = 0
}
/^jdk\.ExecutionSample/ { flush(); inev = 1; hasai = hasgame = hasload = hasstatic = hascopy = 0; top = ""; inst = 0; next }
/stackTrace = \[/ { inst = 1; next }
inst && /^[ \t]+\]/ { inst = 0; next }
inst {
  f = $1
  if (top == "") top = f
  if (f ~ /^forge\.ai\./) hasai = 1
  if (f ~ /^forge\.game\./) hasgame = 1
  if (f ~ /CardStorageReader|StaticData|CardDb|forge\.card\.CardRules/) hasload = 1
  if (f ~ /checkStaticAbilities|StaticAbilityContinuous|checkStateEffects/) hasstatic = 1
  if (f ~ /GameCopier|copyLastState|getLKICopy|CardCopyService/) hascopy = 1
}
END {
  flush()
  printf "samples: %d\n", total
  for (c in n) printf "  %-8s %6d  %5.1f%%   (static/SBA recompute inside: %5.1f%% of class; copies/LKI inside: %5.1f%%)\n", c, n[c], 100*n[c]/total, 100*st[c]/n[c], 100*cp[c]/n[c]
  print "top self classes (ai and engine):"
  for (k in self) if (k ~ /^(ai|engine) /) print self[k], k | "sort -rn | head -25"
}
