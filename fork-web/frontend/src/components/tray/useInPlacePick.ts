import { useCallback } from 'react';
import type { TargetRef } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { inPlaceRefs, toggleOption, trayDraft } from './trayLogic';

/**
 * Click handler for in-place choices: toggles the clicked option and returns
 * true. Other cards and players do nothing while such a choice is open (also
 * true). Returns false when no in-place choice is open.
 */
export function useInPlacePick(): (t: TargetRef) => boolean {
  const { game, ui, setUi } = useMatch();
  return useCallback(
    (t: TargetRef) => {
      const d = game.decision;
      if (d.kind !== 'choice' || d.prompt.shape !== 'chooseN') return false;
      const refs = inPlaceRefs(game, d.prompt);
      if (!refs) return false;
      const optionId = t.kind === 'card' ? refs.cards.get(t.id) : refs.players.get(t.id);
      if (optionId) setUi({ choiceDraft: toggleOption(d.prompt, trayDraft(d.prompt, ui.choiceDraft), optionId) });
      return true;
    },
    [game, ui.choiceDraft, setUi],
  );
}
