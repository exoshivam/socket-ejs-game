import type { CSSProperties } from 'react';

export const GOLD = '#d9b56a';

export const Spade = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="spade-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6dc95" />
        <stop offset="1" stopColor="#b8862f" />
      </linearGradient>
    </defs>
    <path
      fill="url(#spade-gold)"
      d="M12 2C9 6 3.5 9 3.5 13.5A4.5 4.5 0 0 0 11 16.8L9.5 22h5L13 16.8a4.5 4.5 0 0 0 7.5-3.3C20.5 9 15 6 12 2z"
    />
  </svg>
);

export const Swords = ({ size = 72 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="4 4 56 56" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="blade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f2f4f7" />
        <stop offset="1" stopColor="#8a929e" />
      </linearGradient>
    </defs>
    {[false, true].map(flip => (
      <g key={String(flip)} transform={flip ? 'matrix(-1 0 0 1 64 0)' : undefined}>
        <path d="M10 8l30 30-3 3L7 11z" fill="url(#blade)" stroke="#5b626c" strokeWidth="1" />
        <path d="M34 44l10-10M38 46l8-8" stroke="#b9945a" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 44l8 8" stroke="#6b4a2a" strokeWidth="4" strokeLinecap="round" />
        <circle cx="54" cy="54" r="2.5" fill="#d9b56a" />
      </g>
    ))}
  </svg>
);

export const Orb = ({ size = 72 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="4 4 56 56" aria-hidden="true">
    <defs>
      <radialGradient id="orb" cx="0.38" cy="0.32" r="0.7">
        <stop offset="0" stopColor="#f3dcff" />
        <stop offset="0.25" stopColor="#b56cff" />
        <stop offset="0.7" stopColor="#5b18c9" />
        <stop offset="1" stopColor="#2a0768" />
      </radialGradient>
      <radialGradient id="orb-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.55" stopColor="#a855f7" stopOpacity="0.55" />
        <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="29" r="29" fill="url(#orb-glow)" />
    <circle cx="32" cy="29" r="19" fill="url(#orb)" />
    <ellipse cx="25" cy="21" rx="6" ry="3.5" fill="#fff" opacity="0.55" transform="rotate(-30 25 21)" />
    <path d="M20 47q12 8 24 0l-3 7H23z" fill="#b9945a" />
  </svg>
);

export const Dagger = ({ size = 72 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="4 4 56 56" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="dagger" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2f4f7" />
        <stop offset="1" stopColor="#7d8591" />
      </linearGradient>
    </defs>
    <path d="M14 52L40 22l4 4-30 26z" fill="url(#dagger)" stroke="#5b626c" strokeWidth="1" />
    <path d="M38 18l10 10" stroke="#b9945a" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M45 19l6-6" stroke="#6b4a2a" strokeWidth="4" strokeLinecap="round" />
    <circle cx="53" cy="11" r="2.5" fill="#d9b56a" />
  </svg>
);

export const Gear = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
    <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.3 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />
  </svg>
);

export const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e2d6" strokeWidth="2.5" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Door = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="2.5" width="14" height="19" rx="1" fill="#7a4a24" stroke={GOLD} strokeWidth="1.2" />
    <circle cx="15.5" cy="12.5" r="1.2" fill={GOLD} />
  </svg>
);

export const Plus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M12 4v16M4 12h16" />
  </svg>
);

/** Gold scroll in one corner of the panel; rotated for the other three. */
export const Flourish = ({ style }: { style: CSSProperties }) => (
  <svg className="lobby-flourish" style={style} width="34" height="34" viewBox="0 0 34 34" fill="none" stroke={GOLD} strokeWidth="1.2" aria-hidden="true">
    <path d="M2 32V8a6 6 0 0 1 6-6h24" />
    <path d="M6 26V11a5 5 0 0 1 5-5h15" opacity="0.6" />
    <path d="M2 14c5 0 8-3 8-8" />
    <circle cx="10" cy="10" r="1.6" fill={GOLD} />
  </svg>
);

export const Wifi = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.6 15.4a5 5 0 0 1 6.8 0" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="8" y="8" width="12" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2" />
  </svg>
);

export const Crown = () => (
  <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
    <path d="M3 8l7 6 7-11 7 11 7-6-3 14H6z" fill="url(#spade-gold)" stroke="#8a6422" strokeWidth="1" />
    <circle cx="3" cy="7" r="2" fill="#f6dc95" />
    <circle cx="17" cy="2.5" r="2" fill="#f6dc95" />
    <circle cx="31" cy="7" r="2" fill="#f6dc95" />
  </svg>
);

export const Silhouette = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#8e95a0" aria-hidden="true">
    <circle cx="12" cy="8" r="4.5" />
    <path d="M3.5 21c.8-4.5 4.3-7 8.5-7s7.7 2.5 8.5 7z" />
  </svg>
);

export const Send = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a1208" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.5 2.5L10 14M21.5 2.5l-7 19-4.5-7.5-7.5-4.5z" />
  </svg>
);

export const People = () => (
  <svg width="40" height="32" viewBox="0 0 40 32" fill={GOLD} aria-hidden="true">
    <circle cx="20" cy="9" r="6" />
    <path d="M9 30c0-7 5-11 11-11s11 4 11 11z" />
    <circle cx="8" cy="12" r="4.2" opacity="0.85" />
    <path d="M0 29c0-5 3.5-8 8-8 1.7 0 3.2.4 4.4 1.2C10 24 8.5 26.5 8.2 29z" opacity="0.85" />
    <circle cx="32" cy="12" r="4.2" opacity="0.85" />
    <path d="M40 29c0-5-3.5-8-8-8-1.7 0-3.2.4-4.4 1.2C30 24 31.5 26.5 31.8 29z" opacity="0.85" />
  </svg>
);

export const Gamepad = () => (
  <svg width="34" height="26" viewBox="0 0 34 26" fill="currentColor" aria-hidden="true">
    <path d="M9 2h16c4.5 0 7.6 3.5 8.4 9l.6 6.5c.4 4-3.6 6.6-6.8 3.9L23 18H11l-4.2 3.4C3.6 24.1-.4 21.5 0 17.5L.6 11C1.4 5.5 4.5 2 9 2z" />
    <path d="M8 8v6M5 11h6" stroke="#2b1418" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="24" cy="9" r="1.7" fill="#2b1418" />
    <circle cx="27.5" cy="12.5" r="1.7" fill="#2b1418" />
  </svg>
);

export const ChatBubble = () => (
  <svg width="30" height="28" viewBox="0 0 30 28" aria-hidden="true">
    <path d="M15 2C7.3 2 1 7 1 13.2c0 3.4 1.9 6.5 4.9 8.5L4.5 27l6.3-3.4c1.3.3 2.8.5 4.2.5 7.7 0 14-5 14-11S22.7 2 15 2z" fill="url(#spade-gold)" />
    <circle cx="9" cy="13" r="1.8" fill="#1a1208" />
    <circle cx="15" cy="13" r="1.8" fill="#1a1208" />
    <circle cx="21" cy="13" r="1.8" fill="#1a1208" />
  </svg>
);

export const CHARACTER_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  warrior: Swords,
  mage: Orb,
  rogue: Dagger,
};
export const CHARACTER_LABEL: Record<string, string> = { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue' };
