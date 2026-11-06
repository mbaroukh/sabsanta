import { useEffect, useState } from "react";

/** Fait défiler des noms en ralentissant, puis s'arrête sur `target`. */
export function Roulette({
  names,
  target,
  onDone,
}: {
  names: string[];
  target: string;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(names[0] ?? target);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const pool = names.length > 0 ? names : [target];
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const total = 24;
    const tick = () => {
      step++;
      if (step >= total) {
        setShown(target);
        setStopped(true);
        timer = setTimeout(onDone, 600);
        return;
      }
      setShown(pool[Math.floor(Math.random() * pool.length)] as string);
      timer = setTimeout(tick, 40 + step * step * 0.5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [names, target, onDone]);

  return (
    <div
      aria-live="polite"
      data-testid="roulette"
      className={`rounded-2xl border-4 px-8 py-10 text-center text-4xl font-bold transition-colors ${
        stopped
          ? "border-green-600 bg-green-50 text-green-800"
          : "border-red-300 bg-white text-red-700"
      }`}
    >
      {shown}
    </div>
  );
}
