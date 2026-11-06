// Tirage Secret Santa : module pur (aucune dépendance), exécuté côté serveur par les Edge Functions.
// Contraintes dures : pas soi-même, exclusions de l'admin, pas de binôme réciproque (A→B et B→A).
// Mode classique : backtracking randomisé. Mode Sab : branch & bound qui minimise d'abord le rang
// maximum obtenu, puis la somme des rangs, avec départage aléatoire et garde-fou de temps.

export type Pair = readonly [giver: string, receiver: string];

export interface DrawInput {
  participants: string[];
  /** Paires (donneur, receveur) interdites. */
  exclusions?: Pair[];
  /** Si présent : mode Sab. Pour chaque donneur, ses receveurs du préféré au moins préféré. */
  preferences?: Record<string, string[]>;
  rng?: () => number;
  timeLimitMs?: number;
}

export type DrawFailure = "too_few" | "no_candidates" | "impossible" | "timeout";

export type DrawResult =
  | {
      ok: true;
      assignments: Record<string, string>;
      /** Mode Sab uniquement. */
      maxRank?: number;
      totalCost?: number;
      /** false si le garde-fou de temps a interrompu l'optimisation. */
      optimal: boolean;
    }
  | {
      ok: false;
      reason: DrawFailure /** Participants concernés (no_candidates). */;
      detail?: string[];
    };

class Timeout extends Error {}

export function draw(input: DrawInput): DrawResult {
  const { participants } = input;
  const n = participants.length;
  const rng = input.rng ?? Math.random;
  const timeLimitMs = input.timeLimitMs ?? 2000;
  if (n < 3) return { ok: false, reason: "too_few" };

  const index = new Map(participants.map((p, i) => [p, i] as const));
  const excluded = new Set<number>();
  for (const [g, r] of input.exclusions ?? []) {
    const gi = index.get(g);
    const ri = index.get(r);
    if (gi !== undefined && ri !== undefined) excluded.add(gi * n + ri);
  }

  const sab = input.preferences !== undefined;
  // cost[i][j] : rang (1 = préféré). Hors classement : n (pire que tout rang possible). Classique : 1.
  const cost: number[][] = participants.map((p, i) => {
    const row = new Array<number>(n).fill(sab ? n : 1);
    const ranked = input.preferences?.[p] ?? [];
    ranked.forEach((q, k) => {
      const j = index.get(q);
      if (j !== undefined && j !== i && row[j] === n) row[j] = Math.min(k + 1, n);
    });
    return row;
  });

  const allowed: number[][] = participants.map((_, i) => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (j !== i && !excluded.has(i * n + j)) out.push(j);
    return out;
  });
  const stuck = allowed.flatMap((a, i) => (a.length === 0 ? [participants[i] as string] : []));
  if (stuck.length > 0) return { ok: false, reason: "no_candidates", detail: stuck };

  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const k = Math.floor(rng() * (i + 1));
      [arr[i], arr[k]] = [arr[k] as T, arr[i] as T];
    }
    return arr;
  };
  // Ordre de base aléatoire par donneur, puis tri stable par coût : départage aléatoire.
  const shuffled = allowed.map((a) => shuffle([...a]));

  const deadline = Date.now() + timeLimitMs;

  /**
   * Cherche une affectation dont tous les rangs sont <= cap.
   * optimize=false : s'arrête à la première solution. optimize=true : minimise la somme (B&B).
   */
  function search(cap: number, optimize: boolean, limit: number) {
    const assign = new Array<number>(n).fill(-1);
    const used = new Array<boolean>(n).fill(false);
    let best: number[] | null = null;
    let bestSum = Number.POSITIVE_INFINITY;
    let nodes = 0;
    const stop = Date.now() + limit;

    const dfs = (depth: number, sum: number): boolean => {
      if ((++nodes & 1023) === 0 && Date.now() > Math.min(stop, deadline + 500))
        throw new Timeout();
      if (depth === n) {
        if (sum < bestSum) {
          bestSum = sum;
          best = assign.slice();
        }
        return !optimize;
      }
      // Donneur le plus contraint (MRV) + borne inférieure du coût restant.
      let pick = -1;
      let pickOpts: number[] = [];
      let lower = 0;
      for (let i = 0; i < n; i++) {
        if (assign[i] !== -1) continue;
        const opts: number[] = [];
        let minCost = Number.POSITIVE_INFINITY;
        for (const j of shuffled[i] as number[]) {
          if (used[j] || (cost[i] as number[])[j]! > cap || assign[j] === i) continue;
          opts.push(j);
          minCost = Math.min(minCost, (cost[i] as number[])[j] as number);
        }
        if (opts.length === 0) return false;
        lower += minCost;
        if (pick === -1 || opts.length < pickOpts.length) {
          pick = i;
          pickOpts = opts;
        }
      }
      if (sum + lower >= bestSum) return false;
      const row = cost[pick] as number[];
      pickOpts.sort((a, b) => (row[a] as number) - (row[b] as number)); // stable : aléa conservé
      for (const j of pickOpts) {
        assign[pick] = j;
        used[j] = true;
        if (dfs(depth + 1, sum + (row[j] as number))) return true;
        assign[pick] = -1;
        used[j] = false;
      }
      return false;
    };

    let interrupted = false;
    try {
      dfs(0, 0);
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      interrupted = true;
    }
    return { best: best as number[] | null, interrupted };
  }

  const build = (assign: number[], optimal: boolean): DrawResult => {
    const assignments: Record<string, string> = {};
    let maxRank = 0;
    let totalCost = 0;
    assign.forEach((j, i) => {
      assignments[participants[i] as string] = participants[j] as string;
      const c = (cost[i] as number[])[j] as number;
      maxRank = Math.max(maxRank, c);
      totalCost += c;
    });
    return sab
      ? { ok: true, assignments, maxRank, totalCost, optimal }
      : { ok: true, assignments, optimal };
  };

  try {
    if (!sab) {
      const r = search(n, false, timeLimitMs);
      if (r.best) return build(r.best, true);
      return { ok: false, reason: r.interrupted ? "timeout" : "impossible" };
    }
    // 1. Plus petit rang maximum T pour lequel une solution existe.
    let cap = 0;
    let first: number[] | null = null;
    let exhausted = true;
    for (cap = 1; cap <= n; cap++) {
      const r = search(cap, false, timeLimitMs);
      if (r.best) {
        first = r.best;
        break;
      }
      if (r.interrupted) {
        exhausted = false;
        break;
      }
    }
    if (!first) {
      // Pas de solution prouvée sous le plafond : on retombe sur n (toutes les paires autorisées).
      const r = search(n, false, 500);
      if (!r.best) return { ok: false, reason: r.interrupted ? "timeout" : "impossible" };
      return build(r.best, false);
    }
    // 2. Minimiser la somme sous ce plafond ; on garde le meilleur trouvé si le temps manque.
    const opt = search(cap, true, timeLimitMs);
    return build(opt.best ?? first, exhausted && !opt.interrupted);
  } catch (e) {
    if (e instanceof Timeout) return { ok: false, reason: "timeout" };
    throw e;
  }
}

/** Générateur pseudo-aléatoire déterministe (tests). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
