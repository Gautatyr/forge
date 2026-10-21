/**
 * Inline SVG icons. Every game state pairs one of these shapes with its
 * colour so the UI never relies on colour alone.
 */
const PATHS = {
  // States
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  /** Mana source you can tap while paying (four-point spark). */
  mana: <path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z" fill="currentColor" />,
  target: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
    </g>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  sword: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 3.5H20.5V9.5L9.5 20.5L3.5 14.5Z" fill="currentColor" fillOpacity="0.25" />
      <path d="M6 12l6 6M3.5 20.5l3-3" />
    </g>
  ),
  shield: (
    <path
      d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"
      fill="currentColor"
      fillOpacity="0.3"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  ),
  hourglass: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M6 3h12M6 21h12" strokeLinecap="round" />
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
    </g>
  ),
  crown: (
    <path
      d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  sick: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h6l-6 7h6" />
      <path d="M13 12h6l-6 7h6" />
    </g>
  ),
  stop: (
    <path
      d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  stopOff: (
    <path d="M8 3.5h8l4.5 4.5v8L16 20.5H8L3.5 16V8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ),
  arrowRight: <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  burst: (
    <path
      d="M12 2l2.2 5.5L20 6l-3 5 4.5 3.5-5.8.8.3 5.7L12 17.5 8 21l.3-5.7-5.8-.8L7 11 4 6l5.8 1.5z"
      fill="currentColor"
    />
  ),
  // Tools
  log: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </g>
  ),
  sliders: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </g>
  ),
  keyboard: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
    </g>
  ),
  undo: <path d="M9 7L4 12l5 5M4.5 12H15a5 5 0 010 10h-2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  endTurn: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l7 6-7 6M12 6l7 6-7 6" />
    </g>
  ),
  eye: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  menu: (
    <g fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </g>
  ),
  flip: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </g>
  ),
  /** Open at a large size (the zone view). */
  expand: (
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  /** Back to the side panel. */
  shrink: (
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  up: <path d="M12 5l7 9H5z" fill="currentColor" />,
  down: <path d="M12 19l7-9H5z" fill="currentColor" />,
  library: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="17" rx="1.5" />
      <path d="M4 6v15h12" />
    </g>
  ),
  hand: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="7" width="9" height="13" rx="1.5" transform="rotate(-12 7.5 13.5)" />
      <rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(10 15.5 11.5)" />
    </g>
  ),
  grave: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M6 21V10a6 6 0 0112 0v11z" />
      <path d="M12 9v6M9.5 11.5h5" strokeLinecap="round" />
    </g>
  ),
  exile: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18L18 6" />
    </g>
  ),
  poison: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 01-12 0c0-3.5 3-6.5 6-11z" />
    </g>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = '1em', title }: { name: IconName; size?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flex: 'none' }}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

/* Seat glyphs: each player gets a shape, so seats are told apart without colour. */
const SEAT_SHAPES = [
  <circle key="0" cx="12" cy="12" r="8" />,
  <path key="1" d="M12 3.5l9 16H3z" />,
  <rect key="2" x="4.5" y="4.5" width="15" height="15" rx="1" />,
  <path key="3" d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" />,
  <path key="4" d="M12 2.8l9 6.6-3.4 10.6H6.4L3 9.4z" />,
  <path key="5" d="M7 3.5h10l5 8.5-5 8.5H7l-5-8.5z" />,
  <path key="6" d="M12 2.5l2.8 6.3 6.7.5-5.1 4.4 1.6 6.6L12 16.8l-6 3.5 1.6-6.6-5.1-4.4 6.7-.5z" />,
  <path key="7" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
];

export function SeatGlyph({ seat, size = '1em' }: { seat: number; size?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flex: 'none' }}>
      <g fill="currentColor" fillOpacity="0.9">
        {SEAT_SHAPES[seat % SEAT_SHAPES.length]}
      </g>
    </svg>
  );
}
