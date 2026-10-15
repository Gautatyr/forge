import type { DistributePrompt, InputPrompt } from '../../model/types';
import type { BodyProps } from './TrayBody';
import styles from '../ChoiceTray.module.css';

/** Placeholder until issue #31 draws distribute, number and name-a-card. */
export function NumberShapes({ prompt }: BodyProps<DistributePrompt | InputPrompt>) {
  return <p className={styles.note}>This kind of question ({prompt.shape}) is not drawn yet.</p>;
}
