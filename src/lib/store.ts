import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Mode } from "./api";

interface Wizard {
  names: string[];
  adminName: string | null;
  /** "donneur→receveur" (noms) */
  exclusions: string[];
  mode: Mode;
  addNames: (raw: string) => void;
  removeName: (name: string) => void;
  setAdmin: (name: string) => void;
  toggleExclusion: (giver: string, receiver: string, reciprocal: boolean) => void;
  setMode: (m: Mode) => void;
  reset: () => void;
}

const key = (g: string, r: string) => `${g}→${r}`;
const initial = { names: [], adminName: null, exclusions: [], mode: "classic" as Mode };

export const splitNames = (raw: string) =>
  raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const useWizard = create<Wizard>()(
  persist(
    (set) => ({
      ...initial,
      addNames: (raw) =>
        set((s) => {
          const known = new Set(s.names.map((n) => n.toLowerCase()));
          const added: string[] = [];
          for (const n of splitNames(raw).map((n) => n.slice(0, 60))) {
            if (!known.has(n.toLowerCase())) {
              known.add(n.toLowerCase());
              added.push(n);
            }
          }
          return { names: [...s.names, ...added] };
        }),
      removeName: (name) =>
        set((s) => ({
          names: s.names.filter((n) => n !== name),
          adminName: s.adminName === name ? null : s.adminName,
          exclusions: s.exclusions.filter((e) => !e.split("→").includes(name)),
        })),
      setAdmin: (adminName) => set({ adminName }),
      toggleExclusion: (g, r, reciprocal) =>
        set((s) => {
          const has = s.exclusions.includes(key(g, r));
          const pairs = reciprocal ? [key(g, r), key(r, g)] : [key(g, r)];
          const rest = s.exclusions.filter((e) => !pairs.includes(e));
          return { exclusions: has ? rest : [...rest, ...pairs] };
        }),
      setMode: (mode) => set({ mode }),
      reset: () => set(initial),
    }),
    { name: "sabsanta:wizard" },
  ),
);

export const parseExclusion = (e: string): [string, string] => {
  const [g, r] = e.split("→");
  return [g as string, r as string];
};
