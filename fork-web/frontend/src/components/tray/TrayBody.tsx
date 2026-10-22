import type { Intent } from '../../model/intents';
import type { ChoiceOption, ChoicePrompt } from '../../model/types';
import type { ChoiceDraft } from '../../state/ui';
import { ChooseN } from './ChooseN';
import { NumberShapes } from './NumberShapes';
import { Order } from './Order';
import { Reveal } from './Reveal';
import { isReveal, type OptionGroup } from './trayLogic';
import { YesNo } from './YesNo';

export interface BodyProps<P extends ChoicePrompt = ChoicePrompt> {
  prompt: P;
  draft: ChoiceDraft;
  setDraft: (d: ChoiceDraft) => void;
  /** Choose N: options in display order (filtered and sorted). */
  visible: ChoiceOption[];
  /** Choose N: `visible` with identical cards grouped (one entry per option when nothing is identical). */
  groups: OptionGroup[];
  send: (intent: Intent) => void;
}

/** One body per prompt shape. NumberShapes draws distribute, number and name a card (§2.3). */
export function TrayBody(props: BodyProps) {
  const { prompt } = props;
  switch (prompt.shape) {
    case 'chooseN':
      return isReveal(prompt) ? <Reveal {...props} prompt={prompt} /> : <ChooseN {...props} prompt={prompt} />;
    case 'yesNo':
      return <YesNo {...props} prompt={prompt} />;
    case 'order':
      return <Order {...props} prompt={prompt} />;
    case 'distribute':
    case 'input':
      return <NumberShapes {...props} prompt={prompt} />;
  }
}
