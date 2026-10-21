import { useLayoutEffect, useRef, useState } from 'react';

/** Content-box size of an element, plus the current root font size (1rem in px). */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0, rem: 16 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const { width: w, height: h } = entry.contentRect;
      setSize((s) => (s.w === w && s.h === h && s.rem === rem ? s : { w, h, rem }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
