import { useMemo, useSyncExternalStore } from "react";
import type { Mode } from "./api";

/** Un espace personnel (participant ou organisateur) mémorisé sur ce navigateur. */
export interface Space {
  token: string;
  /** "p" = participant, "a" = organisateur (le jeton sert aux deux). */
  kind: "p" | "a";
  /** Prénom du participant. */
  name: string;
  /** Nom du Secret Santa. */
  santaName: string;
  code: string;
  mode: Mode;
  total?: number;
}

const KEY = "sabsanta:spaces";
const EVENT = "sabsanta:spaces-changed";

const read = (): string => {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]"; // stockage indisponible (navigation privée…) : la fonctionnalité se désactive
  }
};

const isSpace = (s: unknown): s is Space => {
  const x = s as Partial<Space> | null;
  return (
    !!x &&
    typeof x.token === "string" &&
    (x.kind === "p" || x.kind === "a") &&
    typeof x.name === "string" &&
    typeof x.santaName === "string" &&
    typeof x.code === "string" &&
    (x.mode === "classic" || x.mode === "sab")
  );
};

export function parseSpaces(raw: string): Space[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isSpace) : [];
  } catch {
    return [];
  }
}

const write = (spaces: Space[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(spaces));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* stockage indisponible : le lien personnel reste utilisable */
  }
};

export const loadSpaces = (): Space[] => parseSpaces(read());

/** Ajoute ou met à jour un espace ; le plus récemment visité passe en tête. */
export function saveSpace(space: Space) {
  const current = loadSpaces();
  const same = current[0]?.token === space.token ? current[0] : undefined;
  if (same && JSON.stringify(same) === JSON.stringify(space)) return; // rien à faire
  write([space, ...current.filter((s) => s.token !== space.token)]);
}

export function removeSpace(token: string) {
  write(loadSpaces().filter((s) => s.token !== token));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useSpaces(): Space[] {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  return useMemo(() => parseSpaces(raw), [raw]);
}
