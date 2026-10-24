package forge.game.ability.effects;

import com.google.common.collect.Iterables;
import forge.game.ability.AbilityUtils;
import forge.game.ability.SpellAbilityEffect;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.player.PlayerActionConfirmMode;
import forge.game.spellability.SpellAbility;
import forge.util.Localizer;
import forge.util.collect.FCollection;

public class BidLifeEffect extends SpellAbilityEffect {
    @Override
    protected String getStackDescription(SpellAbility sa) {
        return "Bid Life";
    }

    @Override
    public void resolve(SpellAbility sa) {
        final Card host = sa.getHostCard();
        final Player activator = sa.getActivatingPlayer();
        final FCollection<Player> bidPlayers = new FCollection<>();
        final int startBidding;
        if (sa.hasParam("StartBidding")) {
            String start = sa.getParam("StartBidding");
            if ("Any".equals(start)) {
                startBidding = activator.getController().announceRequirements(sa, 0, Integer.MAX_VALUE, Localizer.getInstance().getMessage("lblChooseStartingBid"));
            } else {
                startBidding = AbilityUtils.calculateAmount(host, start, sa);
            }
        } else {
            startBidding = 0;
        }

        if (sa.hasParam("OtherBidder")) {
            bidPlayers.add(activator);
            bidPlayers.addAll(AbilityUtils.getDefinedPlayers(host, sa.getParam("OtherBidder"), sa));
        } else {
            bidPlayers.addAll(activator.getGame().getPlayersInTurnOrder());
            int pSize = bidPlayers.size();
            // start with the activator
            while (bidPlayers.contains(activator) && !activator.equals(Iterables.getFirst(bidPlayers, null))) {
                bidPlayers.add(pSize - 1, bidPlayers.remove(0));
            }
        }

        // bidPlayers is in turn order, the starting bid holder (the activator) first. Ask each other player in turn
        // after the current high bidder; the bidding ends once the high bid has gone round without being topped.
        Player winner = activator;
        int bid = startBidding;
        int idx = bidPlayers.indexOf(winner);
        int declined = 0;
        while (declined < bidPlayers.size() - (bidPlayers.contains(winner) ? 1 : 0)) {
            idx = (idx + 1) % bidPlayers.size();
            final Player p = bidPlayers.get(idx);
            final boolean result = p.getController().confirmBidAction(sa, PlayerActionConfirmMode.BidLife,
                    Localizer.getInstance().getMessage("lblDoYouWantTopBid") + bid, bid, winner);
            if (result) { // a different choose number
                bid += p.getController().chooseNumber(sa, Localizer.getInstance().getMessage("lblBidLife") + ":", 1, 9);
                winner = p;
                declined = 0;
                host.getGame().getAction().notifyOfValue(sa, p,  Localizer.getInstance().getMessage("lblTopBidWithValueLife", bid), p);
            } else {
                declined++;
            }
        }

        host.setChosenNumber(bid);
        host.addRemembered(winner);
        final SpellAbility action = sa.getAdditionalAbility("BidSubAbility");
        if (action != null) {
            AbilityUtils.resolve(action);
        }
        host.clearRemembered();
    }
}
