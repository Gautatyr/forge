import { useState, type ImgHTMLAttributes } from 'react';
import type { CardFace, CardImage } from '../model/types';
import { pickArtSource } from './cardArt';
import { CardText } from './CardText';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'alt'> & {
  image?: CardImage;
  size: 'normal' | 'large';
  /** What the card says: drawn as a text card when there is no image or none of its sources loads. */
  face: CardFace;
  alt?: string;
};

/**
 * A card image that switches to its fallback (live: Scryfall) when its own source fails, and to the card's text
 * (the engine's data, `CardText`) when no source is left or the card has no image at all (issue #155).
 */
export function CardArt({ image, size, face, alt = '', className, ...img }: Props) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = pickArtSource(image, size, failed);
  if (!src) return <CardText face={face} className={className} />;
  return <img {...img} className={className} alt={alt} src={src} onError={() => setFailed((f) => [...f, src])} />;
}
