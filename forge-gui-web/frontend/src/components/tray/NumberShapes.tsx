import type { DistributePrompt, InputPrompt } from '../../model/types';
import { Distribute } from './Distribute';
import { NameCard } from './NameCard';
import { NumberField, TextField } from './NumberField';
import type { BodyProps } from './TrayBody';

/** The number shapes (design pass 4 §2.3): distribute (and combat damage), number, name a card, text. */
export function NumberShapes(props: BodyProps<DistributePrompt | InputPrompt>) {
  const { prompt } = props;
  if (prompt.shape === 'distribute') return <Distribute {...props} prompt={prompt} />;
  if (prompt.kind === 'number') return <NumberField {...props} prompt={prompt} />;
  if (prompt.kind === 'cardName') return <NameCard {...props} prompt={prompt} />;
  return <TextField {...props} prompt={prompt} />;
}
