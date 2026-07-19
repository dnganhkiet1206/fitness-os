import { lazy } from 'react';

/**
 * MascotLab — internal design reference page.
 * Route: /mascot-lab (unlinked). All artwork is hand-drawn inline SVG.
 */

// ---------- Character palettes ----------
type CharKey = 'koa' | 'blaze' | 'swift' | 'titan' | 'drago' | 'nova';
type Expression = 'neutral' | 'happy' | 'tired';

interface CharConfig {
  key: CharKey;
  name: string;
  species: string;
  body: string;      // main body color
  bodyDark: string;  // shading
  bodyLight: string; // highlight
  accent: string;    // ears inner / belly
  detail: string;    // horn/tuft/etc
}

const CHARS: Record<CharKey, CharConfig> = {
  koa:   { key: 'koa',   name: 'Koa',   species: 'Koala',    body: '#aebdb4', bodyDark: '#7f9089', bodyLight: '#cfd9d3', accent: '#f4b8c4', detail: '#2b2b2f' },
  blaze: { key: 'blaze', name: 'Blaze', species: 'Lion',     body: '#f0b254', bodyDark: '#c78632', bodyLight: '#fbd694', accent: '#cf6b2e', detail: '#7a3b16' },
  swift: { key: 'swift', name: 'Swift', species: 'Fox',      body: '#ee8442', bodyDark: '#b95a22', bodyLight: '#f8b184', accent: '#fff5ec', detail: '#2b1a11' },
  titan: { key: 'titan', name: 'Titan', species: 'Gorilla',  body: '#6b7585', bodyDark: '#454e5c', bodyLight: '#98a2b0', accent: '#a9b0bb', detail: '#2a2f38' },
  drago: { key: 'drago', name: 'Drago', species: 'Dragon',   body: '#62ba74', bodyDark: '#358a4b', bodyLight: '#9ee0aa', accent: '#f5ecd0', detail: '#e0c88a' },
  nova:  { key: 'nova',  name: 'Nova',  species: 'Unicorn',  body: '#f4eefa', bodyDark: '#c9bfd8', bodyLight: '#ffffff', accent: '#b781e8', detail: '#e9c66a' },
};

// ---------- Reusable atoms ----------
function GroundShadow({ cx = 100, cy = 178, rx = 55, ry = 8 }: { cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity={0.35} />;
}

/** Eyes with two catchlights. Expression toggles lid + brow. */
function Eyes({ expression }: { expression: Expression }) {
  const LX = 78, RX = 122, CY = 92, R = 13;
  if (expression === 'tired') {
    return (
      <g>
        {/* brows knitted */}
        <path d="M62 76 Q78 82 92 78" stroke="#1a1a1f" strokeWidth={3} strokeLinecap="round" fill="none" />
        <path d="M108 78 Q122 82 138 76" stroke="#1a1a1f" strokeWidth={3} strokeLinecap="round" fill="none" />
        {/* eye whites */}
        <ellipse cx={LX} cy={CY} rx={R} ry={R} fill="#fff" />
        <ellipse cx={RX} cy={CY} rx={R} ry={R} fill="#fff" />
        {/* half-closed lids */}
        <path d={`M${LX - R} ${CY} a${R} ${R} 0 0 1 ${R * 2} 0 Z`} fill="#2a2a30" transform={`rotate(-8 ${LX} ${CY})`} />
        <path d={`M${RX - R} ${CY} a${R} ${R} 0 0 1 ${R * 2} 0 Z`} fill="#2a2a30" transform={`rotate(8 ${RX} ${CY})`} />
        {/* pupils peeking */}
        <circle cx={LX} cy={CY + 3} r={5} fill="#141418" />
        <circle cx={RX} cy={CY + 3} r={5} fill="#141418" />
        {/* sweat drop */}
        <path d="M145 78 Q149 88 145 94 Q141 88 145 78 Z" fill="#8ecff5" stroke="#4a9ed6" strokeWidth={0.6} />
        <ellipse cx={144} cy={83} rx={1} ry={2} fill="#fff" opacity={0.8} />
      </g>
    );
  }
  const pupilOffsetY = expression === 'happy' ? 1 : 2;
  return (
    <g>
      {/* eye whites */}
      <ellipse cx={LX} cy={CY} rx={R} ry={R + 0.5} fill="#fff" />
      <ellipse cx={RX} cy={CY} rx={R} ry={R + 0.5} fill="#fff" />
      {/* pupils */}
      <ellipse cx={LX} cy={CY + pupilOffsetY} rx={8.5} ry={9.5} fill="#141418" />
      <ellipse cx={RX} cy={CY + pupilOffsetY} rx={8.5} ry={9.5} fill="#141418" />
      {/* catchlights */}
      <circle cx={LX + 2.5} cy={CY - 3} r={2.6} fill="#fff" />
      <circle cx={LX - 3} cy={CY + 4} r={1.2} fill="#fff" />
      <circle cx={RX + 2.5} cy={CY - 3} r={2.6} fill="#fff" />
      <circle cx={RX - 3} cy={CY + 4} r={1.2} fill="#fff" />
    </g>
  );
}

function Mouth({ expression, char }: { expression: Expression; char: CharConfig }) {
  if (expression === 'happy') {
    return (
      <g>
        <path d="M85 118 Q100 138 115 118 Z" fill="#3a1720" stroke="#1a0a0d" strokeWidth={1} />
        <path d="M92 128 Q100 138 108 128 Q100 134 92 128 Z" fill="#e56b8a" />
        {/* blush */}
        <ellipse cx={62} cy={118} rx={9} ry={5} fill="#f28aa4" opacity={0.55} />
        <ellipse cx={138} cy={118} rx={9} ry={5} fill="#f28aa4" opacity={0.55} />
      </g>
    );
  }
  if (expression === 'tired') {
    return <path d="M88 124 Q100 118 112 124" stroke="#1a0a0d" strokeWidth={2.4} strokeLinecap="round" fill="none" />;
  }
  return <path d="M90 118 Q100 126 110 118" stroke="#1a0a0d" strokeWidth={2.4} strokeLinecap="round" fill="none" />;
}

// ---------- Species-specific heads/bodies ----------
function KoalaFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* Ears (behind head, done via a background group) */}
      {/* Nose */}
      <ellipse cx={100} cy={106} rx={14} ry={9} fill="#1a1a1f" />
      <ellipse cx={97} cy={103} rx={4} ry={2.5} fill="#3a3a42" />
    </g>
  );
}
function KoalaEarsBack({ char }: { char: CharConfig }) {
  return (
    <g>
      <circle cx={54} cy={62} r={22} fill={char.body} />
      <circle cx={146} cy={62} r={22} fill={char.body} />
      <circle cx={54} cy={62} r={13} fill={char.accent} />
      <circle cx={146} cy={62} r={13} fill={char.accent} />
      {/* inner fluff */}
      <path d="M46 55 Q54 50 62 55 Q54 60 46 55" fill="#fff" opacity={0.5} />
      <path d="M138 55 Q146 50 154 55 Q146 60 138 55" fill="#fff" opacity={0.5} />
    </g>
  );
}

function LionMane({ char }: { char: CharConfig }) {
  const petals: React.ReactNode[] = [];
  const cx = 100, cy = 95, r = 68;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    petals.push(<circle key={i} cx={x} cy={y} r={17} fill={char.accent} />);
  }
  return (
    <g>
      {petals}
      <circle cx={cx} cy={cy} r={r} fill={char.detail} opacity={0.25} />
    </g>
  );
}
function LionFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* ear tufts */}
      <path d="M58 60 Q64 44 72 60 Z" fill={char.accent} />
      <path d="M128 60 Q136 44 142 60 Z" fill={char.accent} />
      {/* muzzle */}
      <ellipse cx={100} cy={118} rx={22} ry={14} fill={char.bodyLight} />
      <ellipse cx={100} cy={108} rx={6} ry={4.5} fill="#1a1a1f" />
    </g>
  );
}

function FoxEarsBack({ char }: { char: CharConfig }) {
  return (
    <g>
      <path d="M46 72 L62 26 L82 62 Z" fill={char.body} />
      <path d="M154 72 L138 26 L118 62 Z" fill={char.body} />
      <path d="M52 66 L62 34 L74 60 Z" fill={char.detail} />
      <path d="M148 66 L138 34 L126 60 Z" fill={char.detail} />
    </g>
  );
}
function FoxFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* white muzzle triangle */}
      <path d="M78 112 L122 112 L100 138 Z" fill={char.accent} />
      <ellipse cx={100} cy={108} rx={5} ry={4} fill="#1a1a1f" />
    </g>
  );
}
function FoxTail({ char }: { char: CharConfig }) {
  return (
    <g>
      <path d="M150 158 Q180 150 178 178 Q170 172 150 172 Z" fill={char.body} />
      <path d="M172 155 Q182 152 178 168 Q173 164 168 162 Z" fill={char.accent} />
    </g>
  );
}

function GorillaFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* side ears */}
      <ellipse cx={38} cy={90} rx={7} ry={9} fill={char.bodyDark} />
      <ellipse cx={162} cy={90} rx={7} ry={9} fill={char.bodyDark} />
      {/* crown tuft */}
      <path d="M92 40 Q100 28 108 40 Q104 44 100 42 Q96 44 92 40" fill={char.detail} />
      {/* face plate */}
      <ellipse cx={100} cy={110} rx={38} ry={34} fill={char.accent} />
      {/* brow ridge */}
      <path d="M62 80 Q100 72 138 80" stroke={char.bodyDark} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* nostrils */}
      <ellipse cx={94} cy={116} rx={2.2} ry={3} fill="#1a1a1f" />
      <ellipse cx={106} cy={116} rx={2.2} ry={3} fill="#1a1a1f" />
    </g>
  );
}

function DragonSpikes({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* horns */}
      <path d="M64 40 L74 8 L86 40 Z" fill={char.accent} />
      <path d="M136 40 L126 8 L114 40 Z" fill={char.accent} />
      <path d="M68 36 L74 18 L80 36 Z" fill={char.detail} />
      <path d="M132 36 L126 18 L120 36 Z" fill={char.detail} />
      {/* back spikes */}
      <path d="M100 30 L104 12 L108 30 Z" fill={char.detail} />
    </g>
  );
}
function DragonBelly({ char }: { char: CharConfig }) {
  return (
    <g>
      <ellipse cx={100} cy={148} rx={32} ry={22} fill={char.accent} />
      <path d="M84 132 Q100 138 116 132" stroke={char.detail} strokeWidth={1.5} fill="none" />
      <path d="M82 146 Q100 152 118 146" stroke={char.detail} strokeWidth={1.5} fill="none" />
      <path d="M84 160 Q100 166 116 160" stroke={char.detail} strokeWidth={1.5} fill="none" />
    </g>
  );
}
function DragonFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      {/* small nostrils */}
      <ellipse cx={95} cy={110} rx={1.5} ry={2} fill="#1a1a1f" />
      <ellipse cx={105} cy={110} rx={1.5} ry={2} fill="#1a1a1f" />
    </g>
  );
}

function UnicornMane({ char }: { char: CharConfig }) {
  return (
    <g>
      <path d="M40 60 Q30 100 46 140 Q52 108 60 90 Z" fill={char.accent} />
      <path d="M46 70 Q40 108 54 138 Q58 112 62 96 Z" fill="#f6a6d5" />
      <path d="M160 60 Q170 100 154 140 Q148 108 140 90 Z" fill={char.accent} />
      <path d="M154 70 Q160 108 146 138 Q142 112 138 96 Z" fill="#f6a6d5" />
      {/* forelock */}
      <path d="M84 34 Q92 52 106 40 Q112 52 118 36 Q104 44 84 34 Z" fill={char.accent} />
    </g>
  );
}
function UnicornHorn({ char }: { char: CharConfig }) {
  return (
    <g>
      <path d="M92 12 L108 12 L100 -20 Z" fill={char.detail} transform="translate(0 28)" />
      <path d="M96 32 L104 32" stroke="#b08820" strokeWidth={1.2} />
      <path d="M95 26 L105 26" stroke="#b08820" strokeWidth={1.2} />
      <path d="M97 20 L103 20" stroke="#b08820" strokeWidth={1.2} />
    </g>
  );
}
function UnicornFeatures({ char }: { char: CharConfig }) {
  return (
    <g>
      <ellipse cx={100} cy={116} rx={5} ry={3.5} fill="#3a2a35" />
      <path d="M90 122 Q100 130 110 122" stroke="#3a2a35" strokeWidth={1.5} fill="none" opacity={0.6} />
    </g>
  );
}

// ---------- Base mascot body ----------
interface MascotProps {
  char: CharConfig;
  expression: Expression;
  size?: number;
  children?: React.ReactNode; // outfit overlays
}

function Mascot({ char, expression, size = 200, children }: MascotProps) {
  const gradId = `grad-${char.key}`;
  const bodyGradId = `gradBody-${char.key}`;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={char.bodyLight} />
          <stop offset="55%" stopColor={char.body} />
          <stop offset="100%" stopColor={char.bodyDark} />
        </radialGradient>
        <radialGradient id={bodyGradId} cx="40%" cy="30%" r="90%">
          <stop offset="0%" stopColor={char.bodyLight} />
          <stop offset="60%" stopColor={char.body} />
          <stop offset="100%" stopColor={char.bodyDark} />
        </radialGradient>
      </defs>

      <GroundShadow />

      {/* back layers */}
      {char.key === 'koa' && <KoalaEarsBack char={char} />}
      {char.key === 'swift' && <FoxEarsBack char={char} />}
      {char.key === 'swift' && <FoxTail char={char} />}
      {char.key === 'drago' && <DragonSpikes char={char} />}
      {char.key === 'nova' && <UnicornHorn char={char} />}
      {char.key === 'blaze' && <LionMane char={char} />}

      {/* Body (one-piece silhouette head+body blob) */}
      <path
        d="M100 30
           C 60 30, 32 60, 32 100
           C 32 140, 50 172, 100 172
           C 150 172, 168 140, 168 100
           C 168 60, 140 30, 100 30 Z"
        fill={`url(#${gradId})`}
        stroke={char.bodyDark}
        strokeWidth={0.8}
      />

      {/* Belly / face lightening */}
      <ellipse cx={100} cy={140} rx={44} ry={30} fill={char.bodyLight} opacity={0.35} />

      {/* Species-specific facial features */}
      {char.key === 'koa' && <KoalaFeatures char={char} />}
      {char.key === 'blaze' && <LionFeatures char={char} />}
      {char.key === 'swift' && <FoxFeatures char={char} />}
      {char.key === 'titan' && <GorillaFeatures char={char} />}
      {char.key === 'drago' && <DragonBelly char={char} />}
      {char.key === 'drago' && <DragonFeatures char={char} />}
      {char.key === 'nova' && <UnicornMane char={char} />}
      {char.key === 'nova' && <UnicornFeatures char={char} />}

      {/* Eyes + mouth */}
      <Eyes expression={expression} />
      <Mouth expression={expression} char={char} />

      {/* Arms */}
      <ellipse cx={36} cy={130} rx={12} ry={16} fill={char.bodyDark} />
      <ellipse cx={164} cy={130} rx={12} ry={16} fill={char.bodyDark} />
      {/* Feet */}
      <ellipse cx={78} cy={172} rx={16} ry={9} fill={char.bodyDark} />
      <ellipse cx={122} cy={172} rx={16} ry={9} fill={char.bodyDark} />

      {/* Glossy top highlight */}
      <ellipse cx={80} cy={54} rx={30} ry={12} fill="#fff" opacity={0.15} />

      {/* Outfit overlays */}
      {children}
    </svg>
  );
}

// ---------- Outfits ----------
function Sweatband() {
  return (
    <g>
      <path d="M52 58 Q100 40 148 58 L148 68 Q100 52 52 68 Z" fill="#e63946" />
      <path d="M96 46 L104 46 L104 52 L96 52 Z" fill="#fff" />
      <path d="M52 62 Q100 46 148 62" stroke="#a4232f" strokeWidth={1} fill="none" />
    </g>
  );
}
function BaseballCap() {
  return (
    <g>
      <path d="M46 66 Q100 20 154 66 Q100 44 46 66 Z" fill="#2a6fdb" />
      <ellipse cx={100} cy={66} rx={62} ry={10} fill="#1e5bb8" />
      <path d="M100 68 Q160 76 168 84 Q140 82 100 78 Z" fill="#2a6fdb" />
      <circle cx={100} cy={38} r={3} fill="#1a3f78" />
      <path d="M96 58 L104 58 L102 50 L98 50 Z" fill="#fff" />
    </g>
  );
}
function Sunglasses() {
  return (
    <g>
      <path d="M50 88 L150 88" stroke="#111" strokeWidth={3} />
      <rect x={54} y={82} width={38} height={22} rx={9} fill="#111" />
      <rect x={108} y={82} width={38} height={22} rx={9} fill="#111" />
      <path d="M92 92 L108 92" stroke="#111" strokeWidth={3} />
      <path d="M60 86 Q70 84 82 86" stroke="#4a4a52" strokeWidth={1.5} fill="none" />
      <path d="M114 86 Q124 84 136 86" stroke="#4a4a52" strokeWidth={1.5} fill="none" />
    </g>
  );
}
function GoldMedal() {
  return (
    <g>
      {/* ribbon */}
      <path d="M78 30 L92 130 L108 130 L122 30 Z" fill="#c1272d" />
      <path d="M78 30 L92 130 L96 130 L86 30 Z" fill="#8b1a1f" />
      {/* medal */}
      <circle cx={100} cy={140} r={18} fill="#f2c14e" stroke="#a67c1a" strokeWidth={1.5} />
      <circle cx={100} cy={140} r={13} fill="#e8b23c" />
      <path d="M100 132 L102 138 L108 138 L103 142 L105 148 L100 145 L95 148 L97 142 L92 138 L98 138 Z" fill="#a67c1a" />
      <ellipse cx={95} cy={135} rx={3} ry={2} fill="#fff" opacity={0.6} />
    </g>
  );
}
function LiftingBelt() {
  return (
    <g>
      <path d="M32 138 Q100 152 168 138 L168 158 Q100 172 32 158 Z" fill="#5a3a20" />
      <path d="M32 142 Q100 156 168 142" stroke="#3a2510" strokeWidth={1} fill="none" />
      <path d="M32 154 Q100 168 168 154" stroke="#3a2510" strokeWidth={1} fill="none" />
      {/* buckle */}
      <rect x={88} y={140} width={24} height={18} rx={3} fill="#f2c14e" stroke="#a67c1a" strokeWidth={1.2} />
      <rect x={94} y={144} width={4} height={10} fill="#a67c1a" />
      <rect x={102} y={144} width={4} height={10} fill="#a67c1a" />
    </g>
  );
}

// ---------- PART 1: Character sheet cell ----------
function CharacterCell({ char, expression }: { char: CharConfig; expression: Expression }) {
  const label = expression.toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-2xl" style={{ background: '#111116', border: '1px solid #1f1f27' }}>
      <Mascot char={char} expression={expression} size={160} />
      <div className="text-[10px] tracking-[0.25em] font-mono" style={{ color: '#6b6b7a' }}>{label}</div>
    </div>
  );
}

function CharacterRow({ char }: { char: CharConfig }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 px-1">
        <span className="text-xl font-bold" style={{ color: '#e8e8ee' }}>{char.name}</span>
        <span className="text-xs tracking-wider uppercase" style={{ color: '#6b6b7a' }}>{char.species}</span>
        <span className="ml-auto flex gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: char.body }} />
          <span className="w-3 h-3 rounded-full" style={{ background: char.accent }} />
          <span className="w-3 h-3 rounded-full" style={{ background: char.detail }} />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <CharacterCell char={char} expression="neutral" />
        <CharacterCell char={char} expression="happy" />
        <CharacterCell char={char} expression="tired" />
      </div>
    </div>
  );
}

// ---------- PART 2: Outfit cells ----------
function OutfitCell({ label, outfits }: { label: string; outfits: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-2xl" style={{ background: '#111116', border: '1px solid #1f1f27' }}>
      <Mascot char={CHARS.koa} expression="neutral" size={170}>
        {outfits}
      </Mascot>
      <div className="text-[11px] tracking-[0.2em] font-mono uppercase" style={{ color: '#8b8b9a' }}>{label}</div>
    </div>
  );
}

// ---------- PART 3: Gym room ----------
function DumbbellRack() {
  const colors = ['#e8543c', '#f0a83a', '#3ab3d6', '#7a58d8', '#20b684'];
  return (
    <g>
      {/* A-frame */}
      <path d="M0 90 L20 0 L40 90 Z" fill="none" stroke="#3a3a44" strokeWidth={3} />
      <path d="M4 90 L36 90" stroke="#3a3a44" strokeWidth={3} />
      {/* shelves + dumbbells */}
      {[20, 45, 70].map((y, i) => (
        <g key={i}>
          <rect x={6} y={y} width={28} height={3} fill="#2a2a34" />
          {/* hex dumbbell */}
          <polygon points={`8,${y - 6} 12,${y - 9} 16,${y - 6} 16,${y - 2} 12,${y + 1} 8,${y - 2}`} fill={colors[i]} />
          <rect x={16} y={y - 5} width={4} height={3} fill="#1a1a1f" />
          <polygon points={`20,${y - 6} 24,${y - 9} 28,${y - 6} 28,${y - 2} 24,${y + 1} 20,${y - 2}`} fill={colors[i + 2] || colors[0]} />
        </g>
      ))}
      <ellipse cx={20} cy={92} rx={22} ry={3} fill="#000" opacity={0.4} />
    </g>
  );
}

function Barbell() {
  return (
    <g>
      {/* bar */}
      <rect x={0} y={14} width={140} height={4} rx={2} fill="#c8ccd4" />
      <rect x={0} y={14} width={140} height={1} fill="#fff" opacity={0.4} />
      {/* collars */}
      <rect x={22} y={11} width={4} height={10} fill="#4a4a54" />
      <rect x={114} y={11} width={4} height={10} fill="#4a4a54" />
      {/* red bumper plates */}
      <circle cx={14} cy={16} r={14} fill="#c1272d" />
      <circle cx={14} cy={16} r={4} fill="#4a4a54" />
      <circle cx={126} cy={16} r={14} fill="#c1272d" />
      <circle cx={126} cy={16} r={4} fill="#4a4a54" />
      <ellipse cx={70} cy={32} rx={70} ry={4} fill="#000" opacity={0.4} />
    </g>
  );
}

function Kettlebell() {
  return (
    <g>
      <path d="M4 8 Q4 -4 20 -4 Q36 -4 36 8 L32 8 Q32 2 20 2 Q8 2 8 8 Z" fill="#2a2a34" />
      <path d="M0 20 Q0 6 20 6 Q40 6 40 20 Q40 40 20 40 Q0 40 0 20 Z" fill="#3a3a44" stroke="#1a1a1f" strokeWidth={1} />
      <ellipse cx={14} cy={18} rx={8} ry={6} fill="#5a5a64" opacity={0.6} />
      <ellipse cx={20} cy={42} rx={18} ry={3} fill="#000" opacity={0.4} />
    </g>
  );
}

function FlatBench() {
  return (
    <g>
      {/* legs */}
      <path d="M4 30 L14 60" stroke="#2a2a34" strokeWidth={4} />
      <path d="M76 30 L66 60" stroke="#2a2a34" strokeWidth={4} />
      {/* frame */}
      <rect x={4} y={26} width={72} height={5} fill="#1a1a1f" />
      {/* red padding */}
      <rect x={2} y={16} width={76} height={12} rx={5} fill="#c1272d" />
      <rect x={2} y={16} width={76} height={3} rx={2} fill="#e05560" />
      <ellipse cx={40} cy={62} rx={40} ry={4} fill="#000" opacity={0.4} />
    </g>
  );
}

function Treadmill() {
  return (
    <g>
      {/* belt */}
      <path d="M0 60 L10 30 L90 30 L100 60 Z" fill="#1a1a1f" stroke="#2a2a34" strokeWidth={1.5} />
      <path d="M14 34 L86 34" stroke="#3a3a44" strokeWidth={0.8} />
      <path d="M20 45 L80 45" stroke="#3a3a44" strokeWidth={0.8} />
      <path d="M16 55 L84 55" stroke="#3a3a44" strokeWidth={0.8} />
      {/* uprights */}
      <path d="M14 30 L14 -8" stroke="#2a2a34" strokeWidth={3} />
      <path d="M86 30 L86 -8" stroke="#2a2a34" strokeWidth={3} />
      {/* console */}
      <rect x={10} y={-22} width={80} height={16} rx={3} fill="#1a1a1f" stroke="#2a2a34" strokeWidth={1.5} />
      <rect x={14} y={-18} width={72} height={8} rx={2} fill="#18c2dc" opacity={0.9} />
      <rect x={16} y={-16} width={20} height={4} fill="#0a4a54" opacity={0.7} />
      <rect x={40} y={-16} width={14} height={4} fill="#0a4a54" opacity={0.7} />
      <rect x={58} y={-16} width={26} height={4} fill="#0a4a54" opacity={0.7} />
      <ellipse cx={50} cy={62} rx={54} ry={4} fill="#000" opacity={0.5} />
    </g>
  );
}

function PunchingBag() {
  return (
    <g>
      {/* chain */}
      {[0, 6, 12].map(y => (
        <circle key={y} cx={20} cy={y} r={2} fill="none" stroke="#8a8a94" strokeWidth={1} />
      ))}
      <path d="M20 18 L20 22" stroke="#8a8a94" strokeWidth={1} />
      {/* bag */}
      <path d="M6 22 L34 22 L32 82 L8 82 Z" fill="#3a1e18" stroke="#1a0a08" strokeWidth={1.2} />
      <rect x={6} y={22} width={28} height={6} fill="#5a2e24" />
      <path d="M8 40 L32 40" stroke="#1a0a08" strokeWidth={1} />
      <path d="M8 60 L32 60" stroke="#1a0a08" strokeWidth={1} />
      <ellipse cx={20} cy={30} rx={6} ry={3} fill="#fff" opacity={0.15} />
    </g>
  );
}

function GymMirror() {
  return (
    <g>
      <rect x={0} y={0} width={38} height={110} rx={3} fill="#1a1a22" stroke="#3a3a44" strokeWidth={2} />
      <rect x={3} y={3} width={32} height={104} rx={2} fill="#2a3a4a" />
      {/* reflection sheen */}
      <path d="M3 3 L35 60 L35 3 Z" fill="#3a5a6e" opacity={0.5} />
      <path d="M6 10 L10 10 L28 100 L24 100 Z" fill="#fff" opacity={0.08} />
    </g>
  );
}

function PottedPlant() {
  return (
    <g>
      {/* pot */}
      <path d="M4 50 L36 50 L32 78 L8 78 Z" fill="#5a3a20" stroke="#3a2510" strokeWidth={1} />
      <rect x={2} y={48} width={36} height={4} fill="#6a4530" />
      {/* leaves */}
      <path d="M20 50 Q6 30 12 8 Q20 24 20 50" fill="#20b684" />
      <path d="M20 50 Q34 30 28 8 Q20 24 20 50" fill="#2ac48e" />
      <path d="M20 50 Q10 22 20 -2 Q30 22 20 50" fill="#3ad098" />
      <path d="M20 50 Q22 30 18 12" stroke="#158f66" strokeWidth={1} fill="none" />
      <ellipse cx={20} cy={80} rx={18} ry={3} fill="#000" opacity={0.4} />
    </g>
  );
}

function YogaMat() {
  return (
    <g>
      <path d="M0 20 L120 0 L138 12 L18 32 Z" fill="#7a52c8" stroke="#4a2f88" strokeWidth={1} />
      <path d="M6 22 L120 4" stroke="#9a72e8" strokeWidth={0.8} opacity={0.6} />
      <path d="M12 30 L128 12" stroke="#5a3fa0" strokeWidth={0.8} opacity={0.6} />
    </g>
  );
}

function NeonSign() {
  return (
    <g>
      {/* glow */}
      <rect x={-8} y={-6} width={96} height={36} rx={8} fill="#18c2dc" opacity={0.15} />
      <rect x={-4} y={-2} width={88} height={28} rx={6} fill="#18c2dc" opacity={0.25} />
      {/* letters via strokes: A S C N D */}
      <g stroke="#7ff3ff" strokeWidth={2.4} fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px #18c2dc)' }}>
        {/* A */}
        <path d="M4 20 L10 4 L16 20 M6 14 L14 14" />
        {/* S */}
        <path d="M28 6 Q20 6 20 10 Q20 14 28 14 Q36 14 36 18 Q36 22 28 22 Q22 22 22 18" />
        {/* C */}
        <path d="M52 8 Q42 8 42 14 Q42 22 52 22" />
        {/* N */}
        <path d="M58 22 L58 6 L70 22 L70 6" />
        {/* D */}
        <path d="M74 22 L74 6 L80 6 Q86 6 86 14 Q86 22 80 22 L74 22" />
      </g>
    </g>
  );
}

function Poster({ palette }: { palette: [string, string] }) {
  return (
    <g>
      <rect x={0} y={0} width={40} height={54} rx={2} fill="#1a1a22" stroke="#3a3a44" strokeWidth={1.5} />
      <rect x={3} y={3} width={34} height={48} fill={palette[0]} />
      <path d="M3 51 L37 3" stroke={palette[1]} strokeWidth={4} />
      <circle cx={20} cy={22} r={7} fill={palette[1]} opacity={0.8} />
      <rect x={8} y={40} width={24} height={2} fill={palette[1]} />
      <rect x={12} y={44} width={16} height={1.5} fill={palette[1]} opacity={0.7} />
    </g>
  );
}

type Floor = 'rubber' | 'wood' | 'neon';

function GymRoom({ char, floor }: { char: CharConfig; floor: Floor }) {
  const W = 540, H = 480;
  const floorY = 300;

  const floorFill =
    floor === 'rubber' ? '#151519' :
    floor === 'wood'   ? '#4a2f1a' :
                         '#0a0a10';

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: '#0a0a0d', border: '1px solid #1f1f27' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`wall-${floor}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a24" />
            <stop offset="100%" stopColor="#0e0e14" />
          </linearGradient>
          <linearGradient id={`floor-${floor}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={floorFill} />
            <stop offset="100%" stopColor="#050508" />
          </linearGradient>
          <radialGradient id={`spot-${floor}`} cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#9a6ae8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#9a6ae8" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`windowSky-${floor}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2848" />
            <stop offset="100%" stopColor="#3a2a68" />
          </linearGradient>
        </defs>

        {/* wall */}
        <rect x={0} y={0} width={W} height={floorY} fill={`url(#wall-${floor})`} />

        {/* LED ceiling strip (purple) */}
        <rect x={10} y={4} width={W - 20} height={3} fill="#9a6ae8" />
        <rect x={10} y={4} width={W - 20} height={12} fill="url(#spot-${floor})" opacity={0.7} />
        <rect x={0} y={0} width={W} height={30} fill={`url(#spot-${floor})`} />

        {/* Neon cyan accent stripe on wall */}
        <rect x={0} y={190} width={W} height={2} fill="#18c2dc" opacity={0.9} />
        <rect x={0} y={188} width={W} height={8} fill="#18c2dc" opacity={0.18} />

        {/* Window with city skyline */}
        <g transform="translate(340 40)">
          <rect x={0} y={0} width={160} height={110} rx={4} fill="#0a0a12" stroke="#3a3a48" strokeWidth={3} />
          <rect x={4} y={4} width={152} height={102} fill={`url(#windowSky-${floor})`} />
          {/* moon */}
          <circle cx={130} cy={26} r={12} fill="#f4eefa" opacity={0.9} />
          <circle cx={126} cy={22} r={9} fill="#0a0a12" opacity={0.4} />
          {/* stars */}
          {[[20, 14], [50, 22], [80, 12], [100, 30], [40, 40]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.8} fill="#fff" opacity={0.8} />
          ))}
          {/* skyline */}
          <path d="M4 106 L4 80 L20 80 L20 60 L34 60 L34 78 L48 78 L48 50 L62 50 L62 68 L78 68 L78 40 L92 40 L92 70 L106 70 L106 56 L120 56 L120 76 L136 76 L136 64 L152 64 L152 106 Z" fill="#0a0a10" />
          {/* windows lit */}
          {[[26, 68], [40, 68], [54, 58], [66, 76], [82, 50], [96, 78], [110, 62], [126, 82], [140, 72]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={2} height={2} fill="#f0b254" opacity={0.9} />
          ))}
          {/* mullion */}
          <path d="M80 4 L80 106" stroke="#3a3a48" strokeWidth={2} />
          <path d="M4 55 L156 55" stroke="#3a3a48" strokeWidth={2} />
        </g>

        {/* Posters (left of window) */}
        <g transform="translate(20 60)">
          <Poster palette={['#c1272d', '#f0b254']} />
        </g>
        <g transform="translate(76 90)">
          <Poster palette={['#20b684', '#7ff3ff']} />
        </g>

        {/* Mirror */}
        <g transform="translate(140 70)">
          <GymMirror />
        </g>

        {/* Neon sign */}
        <g transform="translate(210 40)">
          <NeonSign />
        </g>

        {/* Floor */}
        <path d={`M0 ${floorY} L${W} ${floorY} L${W} ${H} L0 ${H} Z`} fill={`url(#floor-${floor})`} />

        {/* Floor pattern */}
        {floor === 'rubber' && (
          <g opacity={0.4}>
            {Array.from({ length: 12 }).map((_, i) => (
              <circle key={i} cx={30 + i * 45} cy={floorY + 40 + (i % 2) * 30} r={2} fill="#2a2a34" />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <circle key={`b-${i}`} cx={50 + i * 45} cy={floorY + 90 + (i % 2) * 30} r={2} fill="#2a2a34" />
            ))}
          </g>
        )}
        {floor === 'wood' && (
          <g opacity={0.7}>
            {[0, 40, 80, 120, 160].map(dy => (
              <path key={dy} d={`M0 ${floorY + dy} L${W} ${floorY + dy}`} stroke="#2e1c0f" strokeWidth={1} />
            ))}
            {[60, 180, 300, 420].map(x => (
              <path key={x} d={`M${x} ${floorY} L${x} ${H}`} stroke="#2e1c0f" strokeWidth={1} opacity={0.6} />
            ))}
            <rect x={0} y={floorY} width={W} height={H - floorY} fill="#8a5a30" opacity={0.15} />
          </g>
        )}
        {floor === 'neon' && (
          <g stroke="#18c2dc" strokeWidth={1} opacity={0.5} style={{ filter: 'drop-shadow(0 0 2px #18c2dc)' }}>
            {[0, 40, 80, 120, 160].map(dy => (
              <path key={dy} d={`M0 ${floorY + dy} L${W} ${floorY + dy}`} />
            ))}
            {[60, 140, 220, 300, 380, 460].map(x => {
              const skew = (x - W / 2) * 0.15;
              return <path key={x} d={`M${x - skew} ${floorY} L${x + skew} ${H}`} />;
            })}
          </g>
        )}

        {/* --- Furniture on floor --- */}

        {/* Punching bag (hanging, back-left) */}
        <g transform="translate(30 130)">
          <path d="M20 0 L20 22" stroke="#8a8a94" strokeWidth={1} />
          <PunchingBag />
        </g>

        {/* Dumbbell rack (back-right of mirror) */}
        <g transform="translate(440 210)">
          <DumbbellRack />
        </g>

        {/* Bench (mid-right) */}
        <g transform="translate(360 300)">
          <FlatBench />
        </g>

        {/* Treadmill (right side, deeper) */}
        <g transform="translate(420 340)">
          <Treadmill />
        </g>

        {/* Barbell on floor (front-left) */}
        <g transform="translate(30 400)">
          <Barbell />
        </g>

        {/* Kettlebell (front-center-left) */}
        <g transform="translate(190 400)">
          <Kettlebell />
        </g>

        {/* Yoga mat (front, purple) */}
        <g transform="translate(200 430)">
          <YogaMat />
        </g>

        {/* Potted plant (front-left corner) */}
        <g transform="translate(6 360)">
          <PottedPlant />
        </g>

        {/* Mascot in center */}
        <g transform="translate(230 250)">
          <Mascot char={char} expression="happy" size={140} />
        </g>
      </svg>
    </div>
  );
}

// ---------- Page ----------
export default function MascotLab() {
  const charList: CharKey[] = ['koa', 'blaze', 'swift', 'titan', 'drago', 'nova'];

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0d', color: '#e8e8ee', overflowY: 'auto' }} className="w-full">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {/* Header */}
        <header className="flex items-baseline justify-between border-b pb-6" style={{ borderColor: '#1f1f27' }}>
          <div>
            <h1 className="text-4xl font-black tracking-tight">Mascot Lab</h1>
            <p className="text-sm mt-1" style={{ color: '#6b6b7a' }}>Internal design reference · /mascot-lab</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono tracking-widest" style={{ color: '#6b6b7a' }}>
            <span>v0.1</span>
            <span>·</span>
            <span>SVG ONLY</span>
          </div>
        </header>

        {/* PART 1 */}
        <section className="space-y-6">
          <div className="flex items-baseline gap-4">
            <span className="text-[11px] font-mono tracking-[0.3em]" style={{ color: '#18c2dc' }}>PART 01</span>
            <h2 className="text-2xl font-bold">Character reference sheet</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {charList.map(k => <CharacterRow key={k} char={CHARS[k]} />)}
          </div>
        </section>

        {/* PART 2 */}
        <section className="space-y-6">
          <div className="flex items-baseline gap-4">
            <span className="text-[11px] font-mono tracking-[0.3em]" style={{ color: '#9a6ae8' }}>PART 02</span>
            <h2 className="text-2xl font-bold">Outfit layer sheet · Koa</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <OutfitCell label="Sweatband" outfits={<Sweatband />} />
            <OutfitCell label="Baseball Cap" outfits={<BaseballCap />} />
            <OutfitCell label="Sunglasses" outfits={<Sunglasses />} />
            <OutfitCell label="Gold Medal" outfits={<GoldMedal />} />
            <OutfitCell label="Lifting Belt" outfits={<LiftingBelt />} />
            <OutfitCell label="Combo · Band + Belt + Medal" outfits={<><Sweatband /><LiftingBelt /><GoldMedal /></>} />
          </div>
        </section>

        {/* PART 3 */}
        <section className="space-y-6">
          <div className="flex items-baseline gap-4">
            <span className="text-[11px] font-mono tracking-[0.3em]" style={{ color: '#f08a3a' }}>PART 03</span>
            <h2 className="text-2xl font-bold">Gym room · floor variants</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <GymRoom char={CHARS.blaze} floor="rubber" />
              <div className="text-[11px] font-mono tracking-[0.2em] uppercase" style={{ color: '#8b8b9a' }}>a · Rubber</div>
            </div>
            <div className="space-y-2">
              <GymRoom char={CHARS.drago} floor="wood" />
              <div className="text-[11px] font-mono tracking-[0.2em] uppercase" style={{ color: '#8b8b9a' }}>b · Wood</div>
            </div>
            <div className="space-y-2">
              <GymRoom char={CHARS.nova} floor="neon" />
              <div className="text-[11px] font-mono tracking-[0.2em] uppercase" style={{ color: '#8b8b9a' }}>c · Pro Neon</div>
            </div>
          </div>
        </section>

        <footer className="pt-8 border-t text-[10px] font-mono tracking-widest text-center" style={{ borderColor: '#1f1f27', color: '#4a4a54' }}>
          ASCND · MASCOT LAB · INTERNAL
        </footer>
      </div>
    </div>
  );
}
