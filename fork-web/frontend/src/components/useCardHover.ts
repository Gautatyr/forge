import { useEffect, useRef, type FocusEvent, type MouseEvent } from 'react';
import { useMatch } from '../state/MatchContext';
import { previewBeside } from './previewSpot';

/**
 * The hover preview of a card (HoverPreview): handlers for the element standing for `cardId`, on pointer or focus. The
 * element that starts a hover ends it, also when it is taken off the page (pointerleave and blur never fire then), or
 * the preview would stay up until another card is hovered.
 */
export function useCardHover(cardId: string) {
  const { setUi } = useMatch();
  // Whether the pointer or focus is on the element: it started the hover and must end it.
  const hovered = useRef(false);
  const onEnter = (e: MouseEvent | FocusEvent) => {
    hovered.current = true;
    const beside = previewBeside(e.currentTarget as Element);
    setUi((u) => (u.hover?.cardId === cardId && !u.hover.beside === !beside ? u : { ...u, hover: { cardId, beside } }));
  };
  const onLeave = () => {
    hovered.current = false;
    setUi((u) => (u.hover?.cardId === cardId ? { ...u, hover: undefined } : u));
  };
  useEffect(() => {
    return () => {
      if (!hovered.current) return;
      hovered.current = false;
      setUi((u) => (u.hover?.cardId === cardId ? { ...u, hover: undefined } : u));
    };
  }, [cardId, setUi]);
  return { onPointerEnter: onEnter, onPointerLeave: onLeave, onFocus: onEnter, onBlur: onLeave };
}
