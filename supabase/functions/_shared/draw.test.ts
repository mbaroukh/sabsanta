import { describe, expect, test } from "bun:test";
import { type DrawResult, draw, type Pair, seededRng } from "./draw.ts";

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);

function assertValid(participants: string[], excl: Pair[], res: DrawResult) {
  if (!res.ok) throw new Error(`tirage échoué : ${res.reason}`);
  const a = res.assignments;
  expect(Object.keys(a).sort()).toEqual([...participants].sort());
  expect(new Set(Object.values(a)).size).toBe(participants.length); // permutation
  for (const [g, r] of Object.entries(a)) {
    expect(g).not.toBe(r);
    expect(a[r]).not.toBe(g); // pas de réciproque
    expect(excl.some(([x, y]) => x === g && y === r)).toBe(false);
  }
}

function randomCase(seed: number, n: number) {
  const rng = seededRng(seed);
  const ps = names(n);
  const excl: Pair[] = [];
  for (const g of ps) for (const r of ps) if (g !== r && rng() < 0.2) excl.push([g, r]);
  const prefs: Record<string, string[]> = {};
  for (const g of ps) {
    const others = ps.filter((p) => p !== g);
    for (let i = others.length - 1; i > 0; i--) {
      const k = Math.floor(rng() * (i + 1));
      [others[i], others[k]] = [others[k] as string, others[i] as string];
    }
    prefs[g] = others.slice(0, Math.floor(rng() * others.length) + 1); // classement partiel possible
  }
  return { ps, excl, prefs };
}

describe("cas impossibles", () => {
  test("moins de 3 participants", () => {
    for (const n of [0, 1, 2])
      expect(draw({ participants: names(n) })).toEqual({ ok: false, reason: "too_few" });
  });
  test("un participant sans receveur possible", () => {
    const ps = names(4);
    const res = draw({
      participants: ps,
      exclusions: [
        ["P0", "P1"],
        ["P0", "P2"],
        ["P0", "P3"],
      ],
    });
    expect(res).toEqual({ ok: false, reason: "no_candidates", detail: ["P0"] });
  });
  test("réciproque forcée => impossible", () => {
    const ps = names(3);
    // P0 ne peut donner qu'à P1 et P1 qu'à P0 : réciproque obligatoire.
    const excl: Pair[] = [
      ["P0", "P2"],
      ["P1", "P2"],
    ];
    expect(draw({ participants: ps, exclusions: excl })).toEqual({
      ok: false,
      reason: "impossible",
    });
    expect(draw({ participants: ps, exclusions: excl, preferences: {} })).toEqual({
      ok: false,
      reason: "impossible",
    });
  });
  test("3 participants : un cycle existe", () => {
    assertValid(names(3), [], draw({ participants: names(3), rng: seededRng(1) }));
  });
});

describe("mode classique", () => {
  test("contraintes respectées sur de nombreux cas", () => {
    let solved = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const n = 3 + (seed % 10);
      const { ps, excl } = randomCase(seed, n);
      const res = draw({ participants: ps, exclusions: excl, rng: seededRng(seed) });
      if (res.ok) {
        assertValid(ps, excl, res);
        solved++;
      } else expect(["impossible", "no_candidates"]).toContain(res.reason);
    }
    expect(solved).toBeGreaterThan(150);
  });
  test("le résultat varie selon le hasard", () => {
    const ps = names(8);
    const seen = new Set(
      Array.from({ length: 20 }, (_, s) =>
        JSON.stringify(draw({ participants: ps, rng: seededRng(s) })),
      ),
    );
    expect(seen.size).toBeGreaterThan(5);
  });
  test("déterministe à graine égale", () => {
    const ps = names(8);
    expect(draw({ participants: ps, rng: seededRng(7) })).toEqual(
      draw({ participants: ps, rng: seededRng(7) }),
    );
  });
});

/** Force brute : meilleur (rang max, somme) parmi toutes les permutations valides. */
function bruteForce(ps: string[], excl: Pair[], prefs: Record<string, string[]>) {
  const n = ps.length;
  const rank = (g: string, r: string) => {
    const k = (prefs[g] ?? []).indexOf(r);
    return k === -1 ? n : Math.min(k + 1, n);
  };
  let best: [number, number] | null = null;
  const perm: number[] = [];
  const used = new Array(n).fill(false);
  const rec = (i: number) => {
    if (i === n) {
      let mx = 0;
      let sum = 0;
      for (let g = 0; g < n; g++) {
        const c = rank(ps[g] as string, ps[perm[g] as number] as string);
        mx = Math.max(mx, c);
        sum += c;
      }
      if (!best || mx < best[0] || (mx === best[0] && sum < best[1])) best = [mx, sum];
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j] || j === i) continue;
      if (excl.some(([g, r]) => g === ps[i] && r === ps[j])) continue;
      if (perm[j] === i && j < i) continue; // réciproque
      used[j] = true;
      perm[i] = j;
      rec(i + 1);
      used[j] = false;
    }
  };
  rec(0);
  return best as [number, number] | null;
}

describe("mode Sab", () => {
  test("optimal (rang max puis somme) = force brute sur petits cas", () => {
    let compared = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const n = 3 + (seed % 4); // 3..6
      const { ps, excl, prefs } = randomCase(seed * 31, n);
      const expected = bruteForce(ps, excl, prefs);
      const res = draw({
        participants: ps,
        exclusions: excl,
        preferences: prefs,
        rng: seededRng(seed),
      });
      if (!expected) {
        expect(res.ok).toBe(false);
        continue;
      }
      assertValid(ps, excl, res);
      if (!res.ok) continue;
      expect(res.optimal).toBe(true);
      expect([res.maxRank, res.totalCost]).toEqual(expected);
      compared++;
    }
    expect(compared).toBeGreaterThan(100);
  });
  test("tout le monde obtient son premier choix quand c'est possible", () => {
    const ps = names(5);
    const prefs = Object.fromEntries(ps.map((p, i) => [p, [ps[(i + 1) % 5] as string]]));
    const res = draw({ participants: ps, preferences: prefs, rng: seededRng(3) });
    expect(res.ok && res.maxRank).toBe(1);
    expect(res.ok && res.totalCost).toBe(5);
  });
  test("départage aléatoire entre solutions équivalentes", () => {
    const ps = names(6);
    const seen = new Set(
      Array.from({ length: 20 }, (_, s) =>
        JSON.stringify(draw({ participants: ps, preferences: {}, rng: seededRng(s) })),
      ),
    );
    expect(seen.size).toBeGreaterThan(3);
  });
  test("30 participants : valide et dans le temps imparti", () => {
    const { ps, excl, prefs } = randomCase(99, 30);
    const full = Object.fromEntries(ps.map((p) => [p, ps.filter((q) => q !== p)]));
    const t = Date.now();
    const res = draw({
      participants: ps,
      exclusions: excl,
      preferences: { ...full, ...prefs },
      rng: seededRng(5),
    });
    expect(Date.now() - t).toBeLessThan(4000);
    assertValid(ps, excl, res);
  });
});
