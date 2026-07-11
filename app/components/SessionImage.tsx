const ICONS = ["ball", "trophy", "flag", "gloves", "net", "stadium", "boot"] as const;

// Deterministic PRNG so each event id always renders the same unique layout.
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iconPaths: Record<(typeof ICONS)[number], string> = {
  ball:
    '<circle cx="12" cy="12" r="10"/><path d="M12 8 L15.8 10.76 L14.35 15.24 L9.65 15.24 L8.2 10.76 Z"/><path d="M12 8 V2"/><path d="M15.8 10.76 L21.5 8.91"/><path d="M14.35 15.24 L17.88 20.09"/><path d="M9.65 15.24 L6.12 20.09"/><path d="M8.2 10.76 L2.5 8.91"/>',
  trophy:
    '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/><path d="M12 13v4"/><path d="M8 20h8"/><path d="M9 20a3 3 0 0 1 6 0"/>',
  flag: '<path d="M5 2v20"/><path d="M5 3h13l-3 4 3 4H5"/>',
  gloves:
    '<path d="M8 13V8a1.2 1.2 0 0 1 2.4 0v4"/><path d="M10.4 12V6a1.2 1.2 0 0 1 2.4 0v6"/><path d="M12.8 12V6.5a1.2 1.2 0 0 1 2.4 0V13"/><path d="M15.2 13.5V9a1.2 1.2 0 0 1 2.4 0v6a5 5 0 0 1-5 5h-1.6a5 5 0 0 1-3.6-1.5l-3-3.1a1.4 1.4 0 0 1 2-2l1.8 1.7"/>',
  net:
    '<path d="M3 19V6h18v13"/><path d="M3 19h18"/><path d="M9 6v13M15 6v13"/><path d="M3 10.3h18M3 14.6h18"/>',
  stadium:
    '<ellipse cx="12" cy="14" rx="9.5" ry="5.5"/><ellipse cx="12" cy="14" rx="5" ry="2.6"/><path d="M12 8.5V19"/><path d="M4.5 9V6.2h2.2V9"/><path d="M17.3 9V6.2h2.2V9"/>',
  boot:
    '<path d="M3 10c2-.8 4.5-.8 7 0l6.5 1.8A4 4 0 0 1 20 15.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M6 8.5l1 1.6M9 8.2l1 2"/><path d="M6 17v2M10 17v2M14 17v2M18 17v2"/>',
};

const W = 420;
const H = 180;
const COLS = 7;
const ROWS = 3;

export function SessionImage({ seed, className }: { seed: number; className?: string }) {
  const rnd = mulberry32(((seed + 1) * 2654435761) >>> 0);
  const cellW = W / COLS;
  const cellH = H / ROWS;
  const items: { path: string; tx: number; ty: number; rot: number; scale: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const name = ICONS[Math.floor(rnd() * ICONS.length)];
      const scale = 0.7 + rnd() * 0.5;
      const half = (24 * scale) / 2;
      const cx = Math.min(
        W - half,
        Math.max(half, c * cellW + half + rnd() * (cellW - 2 * half))
      );
      const cy = Math.min(
        H - half,
        Math.max(half, r * cellH + half + rnd() * (cellH - 2 * half))
      );
      items.push({
        path: iconPaths[name],
        tx: +(cx - half).toFixed(1),
        ty: +(cy - half).toFixed(1),
        rot: Math.round(rnd() * 40 - 20),
        scale: +scale.toFixed(2),
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      >
        {items.map((it, i) => (
          <g
            key={i}
            transform={`translate(${it.tx} ${it.ty}) rotate(${it.rot} 12 12) scale(${it.scale})`}
            dangerouslySetInnerHTML={{ __html: it.path }}
          />
        ))}
      </g>
    </svg>
  );
}
