import { useState, type ImgHTMLAttributes } from 'react';
import type { CardImage } from '../model/types';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { image: CardImage; size: 'normal' | 'large' };

/** A card image that switches to its fallback (live: Scryfall) when its own source fails. */
export function CardArt({ image, size, ...img }: Props) {
  const [failed, setFailed] = useState<string>();
  const own = image[size];
  const src = failed === own && image.fallback ? image.fallback[size] : own;
  return <img {...img} src={src} onError={() => (src === own && image.fallback ? setFailed(own) : undefined)} />;
}
