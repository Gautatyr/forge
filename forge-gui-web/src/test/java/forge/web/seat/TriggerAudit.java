package forge.web.seat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import com.google.common.eventbus.Subscribe;

import forge.game.Game;
import forge.game.GameEndReason;
import forge.game.card.Card;
import forge.game.event.GameEvent;
import forge.game.event.GameEventSpellAbilityCast;
import forge.game.event.GameEventSpellRemovedFromStack;
import forge.game.event.GameEventSpellResolved;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.spellability.TargetRestrictions;
import forge.game.trigger.WrappedAbility;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;

/**
 * Compares the triggers the engine hands the human seat's controller with what reaches the stack and resolves.
 * A trigger the engine puts on the stack through {@code orderAndPlaySimultaneousSa} must be cast (a
 * {@code GameEventSpellAbilityCast} during that call), unless it has no legal target or the game is over; a static trigger
 * ({@code playTrigger}, no stack) must be played. Every trigger cast must resolve or leave the stack before the game
 * ends, unless it is still there at game over. Also ends a game early (a draw) at a turn cap, or once the seat lost in
 * a multiplayer game, at the start of a turn on the game thread.
 */
final class TriggerAudit {

    /** The human seat's player: its controller reports to the audit. */
    static final class Human extends LobbyPlayerHuman {
        private final TriggerAudit audit;

        Human(TriggerAudit audit) {
            super("You");
            this.audit = audit;
        }

        @Override
        public Player createIngamePlayer(final Game game, final int id) {
            Player p = new Player(forge.util.GuiDisplayUtil.personalizeHuman(getName()), game, id);
            p.setFirstController(new Controller(game, p, this, audit));
            audit.bind(game, p);
            return p;
        }
    }

    static final class Controller extends PlayerControllerHuman {
        private final TriggerAudit audit;

        Controller(Game game, Player p, LobbyPlayerHuman lp, TriggerAudit audit) {
            super(game, p, lp);
            this.audit = audit;
        }

        @Override
        public void orderAndPlaySimultaneousSa(final List<SpellAbility> activePlayerSAs) {
            List<SpellAbility> triggers = new ArrayList<>();
            for (SpellAbility sa : activePlayerSAs) {
                if (sa.isTrigger() && !sa.isCopied()) {
                    triggers.add(sa);
                }
            }
            audit.putting.clear();
            audit.inPut = true;
            try {
                super.orderAndPlaySimultaneousSa(activePlayerSAs);
            } finally {
                audit.inPut = false;
            }
            List<SpellAbility> casts = new ArrayList<>(audit.putting);
            for (SpellAbility t : triggers) {
                SpellAbility cast = casts.stream().filter(c -> same(c, t)).findFirst().orElse(null);
                casts.remove(cast);
                audit.handed(t, cast);
            }
        }

        @Override
        public boolean playTrigger(final Card host, final WrappedAbility wrapperAbility, final boolean isMandatory) {
            boolean played = super.playTrigger(host, wrapperAbility, isMandatory);
            audit.noStack(wrapperAbility, played);
            return played;
        }
    }

    private Game game;
    private Player me;
    private final int turnCap;
    private boolean inPut;
    private final List<SpellAbility> putting = new ArrayList<>();
    /** View ids of this seat's triggers cast, with a description. */
    private final Map<Integer, String> cast = new HashMap<>();
    /** Triggers cast for the seat ({@link #handed}) and still to leave the stack, by view id and count. */
    private final Map<Integer, Integer> left = new HashMap<>();
    /** The last spell or ability that resolved: its own removal from the stack follows. */
    private int justResolved = -1;

    int handed;
    int onStack;
    int noStackPlayed;
    int noLegalTarget;
    /** Handed while the game ended (e.g. the damage that triggered them was lethal): nothing goes on the stack. */
    int afterGameOver;
    int resolved;
    int stillOnStackAtEnd;
    volatile boolean capped;
    volatile long lastEventAt;
    final List<String> dropped = new ArrayList<>();
    final List<String> unresolved = new ArrayList<>();
    final Set<String> triggerCards = new TreeSet<>();
    /** The seat's own spells (cast), abilities (activated, on the stack) and lands, by card name. */
    final Set<String> playedCards = new TreeSet<>();
    int spellsCast;
    int abilitiesActivated;
    int landsPlayed;
    final Set<String> noTargetCards = new LinkedHashSet<>();

    TriggerAudit(int turnCap) {
        this.turnCap = turnCap;
    }

    Game game() {
        return game;
    }

    Player me() {
        return me;
    }

    private void bind(Game g, Player p) {
        game = g;
        me = p;
        g.subscribeToEvents(this);
    }

    private static boolean same(SpellAbility cast, SpellAbility handed) {
        if (cast == handed) {
            return true;
        }
        return cast instanceof WrappedAbility a && handed instanceof WrappedAbility b
                && a.getTrigger() == b.getTrigger() && a.getHostCard() == b.getHostCard();
    }

    private static String describe(SpellAbility sa) {
        Card host = sa.getHostCard();
        return (host == null ? "?" : host.getName()) + ": " + sa;
    }

    /** Some targeting step needs a target and has none ({@code hasCandidates} answers true for any stack target). */
    private boolean noLegalTarget(SpellAbility sa) {
        for (SpellAbility s = sa instanceof WrappedAbility w ? w.getWrappedAbility() : sa; s != null; s = s.getSubAbility()) {
            TargetRestrictions tr = s.usesTargeting() ? s.getTargetRestrictions() : null;
            if (tr == null || s.getMinTargets() <= 0) {
                continue;
            }
            boolean any;
            if (tr.getZone().size() == 1 && tr.getZone().get(0) == forge.game.zone.ZoneType.Stack) {
                any = false;
                for (SpellAbilityStackInstance si : game.getStack()) {
                    any |= s.canTargetSpellAbility(si.getSpellAbility());
                }
            } else {
                any = tr.hasCandidates(s);
            }
            if (!any) {
                return true;
            }
        }
        return false;
    }

    /** A trigger handed to the seat's controller, and what it cast for it (null: nothing). */
    private void handed(SpellAbility t, SpellAbility cast) {
        handed++;
        if (t.getHostCard() != null) {
            triggerCards.add(t.getHostCard().getName());
        }
        if (cast != null) {
            onStack++;
            this.cast.put(cast.getView().getId(), describe(cast));
            left.merge(cast.getView().getId(), 1, Integer::sum);
        } else if (game.isGameOver()) {
            afterGameOver++;
        } else if (noLegalTarget(t)) {
            noLegalTarget++;
            noTargetCards.add(describe(t));
        } else {
            dropped.add("turn " + game.getPhaseHandler().getTurn() + " " + describe(t));
        }
    }

    private void noStack(WrappedAbility w, boolean played) {
        handed++;
        if (w.getHostCard() != null) {
            triggerCards.add(w.getHostCard().getName());
        }
        if (played) {
            noStackPlayed++;
        } else if (game.isGameOver()) {
            afterGameOver++;
        } else if (noLegalTarget(w)) {
            noLegalTarget++;
            noTargetCards.add(describe(w));
        } else {
            dropped.add("turn " + game.getPhaseHandler().getTurn() + " (no stack) " + describe(w));
        }
    }

    @Subscribe
    public void receiveGameEvent(final GameEvent ev) {
        lastEventAt = System.currentTimeMillis();
        if (ev instanceof GameEventSpellAbilityCast c) {
            for (SpellAbilityStackInstance si : game.getStack()) {
                if (si.getId() == c.si().getId()) {
                    SpellAbility sa = si.getSpellAbility();
                    if (inPut) {
                        putting.add(sa);
                    }
                    if (!sa.isTrigger() && sa.getActivatingPlayer() == me && sa.getHostCard() != null) {
                        if (sa.isSpell()) {
                            spellsCast++;
                        } else {
                            abilitiesActivated++;
                        }
                        playedCards.add(sa.getHostCard().getName());
                    }
                }
            }
        } else if (ev instanceof GameEventSpellResolved r) {
            justResolved = r.spell().getId();
            leave(justResolved);
        } else if (ev instanceof GameEventSpellRemovedFromStack r) {
            if (r.sa() == null) { // MagicStack.clear
                left.values().forEach(n -> resolved += n);
                left.clear();
            } else if (r.sa().getId() == justResolved) {
                justResolved = -1; // the removal that follows its resolution (finishResolving)
            } else {
                leave(r.sa().getId()); // countered, exiled from the stack...
            }
        } else if (ev instanceof forge.game.event.GameEventLandPlayed l) {
            if (l.player() == me.getView() && l.land() != null) {
                landsPlayed++;
                playedCards.add(l.land().getName());
            }
        } else if (ev instanceof GameEventTurnBegan t) {
            boolean seatOut = me.hasLost() && game.getPlayers().size() > 1;
            if (t.turnNumber() > turnCap || seatOut) {
                capped = t.turnNumber() > turnCap;
                game.setGameOver(GameEndReason.Draw);
            }
        }
    }

    /** One of this seat's triggers with view id {@code id} left the stack. */
    private void leave(int id) {
        Integer n = left.get(id);
        if (n != null) {
            resolved++;
            if (n == 1) {
                left.remove(id);
            } else {
                left.put(id, n - 1);
            }
        }
    }

    /** After game over: triggers cast and neither resolved nor still on the stack. */
    void finish() {
        Map<Integer, Integer> onStackNow = new HashMap<>();
        for (SpellAbilityStackInstance si : game.getStack()) {
            onStackNow.merge(si.getSpellAbility().getView().getId(), 1, Integer::sum);
        }
        for (Map.Entry<Integer, Integer> e : left.entrySet()) {
            int still = Math.min(e.getValue(), onStackNow.getOrDefault(e.getKey(), 0));
            stillOnStackAtEnd += still;
            for (int i = still; i < e.getValue(); i++) {
                unresolved.add(cast.get(e.getKey()));
            }
        }
    }
}
