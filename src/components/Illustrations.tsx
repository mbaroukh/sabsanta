import { motion, useReducedMotion } from "motion/react";

/** Sapin dessiné à la main en SVG, avec guirlandes qui scintillent. */
export function Tree({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const lights = [
    [100, 62, "#fde047"],
    [78, 104, "#f87171"],
    [124, 110, "#60a5fa"],
    [58, 152, "#fde047"],
    [100, 150, "#f87171"],
    [142, 156, "#fde047"],
    [40, 200, "#60a5fa"],
    [84, 204, "#fde047"],
    [122, 202, "#f87171"],
    [162, 206, "#60a5fa"],
  ] as const;
  return (
    <svg viewBox="0 0 200 260" className={className} role="img" aria-label="Un sapin de Noël">
      <title>Un sapin de Noël</title>
      <rect x="88" y="222" width="24" height="30" rx="3" fill="#7c4a21" />
      <polygon points="100,28 150,100 50,100" fill="#15803d" />
      <polygon points="100,62 164,150 36,150" fill="#16a34a" />
      <polygon points="100,104 178,214 22,214" fill="#15803d" />
      <polygon
        points="100,12 106,28 122,28 109,38 114,54 100,44 86,54 91,38 78,28 94,28"
        fill="#facc15"
      />
      {lights.map(([cx, cy, fill], i) => (
        <motion.circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="5"
          fill={fill}
          animate={reduce ? undefined : { opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, delay: i * 0.25 }}
        />
      ))}
    </svg>
  );
}

/** Paquet cadeau avec ruban. */
export function Gift({
  color = "#dc2626",
  ribbon = "#fde047",
  className = "",
}: {
  color?: string;
  ribbon?: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <rect x="8" y="30" width="64" height="44" rx="4" fill={color} />
      <rect x="4" y="22" width="72" height="14" rx="4" fill={color} stroke="#00000022" />
      <rect x="35" y="22" width="10" height="52" fill={ribbon} />
      <path d="M40 22 C20 2 8 20 40 22 C72 20 60 2 40 22Z" fill={ribbon} />
    </svg>
  );
}

const FLAKES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 4 + ((i * 7) % 9),
  duration: 9 + ((i * 5) % 9),
  delay: -((i * 13) % 17),
  drift: ((i % 5) - 2) * 14,
}));

/** Neige animée plein écran, désactivée si l'utilisateur préfère réduire les animations. */
export function Snow() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {FLAKES.map((f) => (
        <motion.span
          key={`${f.left}-${f.size}-${f.delay}`}
          className="absolute rounded-full bg-white/90 shadow"
          style={{ left: `${f.left}%`, width: f.size, height: f.size, top: -20 }}
          animate={{ y: ["0vh", "105vh"], x: [0, f.drift, 0] }}
          transition={{
            duration: f.duration,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
            delay: f.delay,
          }}
        />
      ))}
    </div>
  );
}
