import { Reorder } from "motion/react";
import { useState } from "react";
import { type ParticipantView, useSubmitPreferences } from "../lib/api";
import { btn, card } from "./Layout";

type Item = { id: string; name: string };

/** Ordre initial : classement déjà enregistré, puis les candidats restants. */
function initialOrder(view: ParticipantView): Item[] {
  const byId = new Map(view.candidates.map((c) => [c.id, c]));
  const ranked = view.preferences.flatMap((p) => {
    const c = byId.get(p.receiver_id);
    return c ? [c] : [];
  });
  const seen = new Set(ranked.map((c) => c.id));
  return [...ranked, ...view.candidates.filter((c) => !seen.has(c.id))];
}

export function Ranking({ token, view }: { token: string; view: ParticipantView }) {
  const [items, setItems] = useState<Item[]>(() => initialOrder(view));
  const submit = useSubmitPreferences(token);
  const done = view.me.prefs_submitted;

  const move = (i: number, delta: number) => {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + delta, 0, it as Item);
    setItems(next);
  };

  return (
    <section className={`${card} space-y-3`} data-testid="ranking">
      <h2 className="font-bold">
        {done
          ? "Mon classement (modifiable jusqu'au tirage)"
          : "Classe les personnes à qui tu aimerais offrir"}
      </h2>
      <p className="text-sm text-slate-600">
        Glisse pour réordonner (ou utilise les flèches) : 1 = celle que tu préfères. Le tirage
        essaie de respecter l'ensemble des classements.
      </p>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
        {items.map((it, i) => (
          <Reorder.Item
            key={it.id}
            value={it}
            className="flex cursor-grab items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <span className="w-6 font-bold text-red-700">{i + 1}</span>
            <span className="flex-1" data-testid="rank-name">
              {it.name}
            </span>
            <button
              type="button"
              aria-label={`Monter ${it.name}`}
              className="px-2 disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Descendre ${it.name}`}
              className="px-2 disabled:opacity-30"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {submit.error && (
        <p role="alert" className="text-red-700">
          {submit.error.message}
        </p>
      )}
      <button
        type="button"
        className={btn}
        disabled={submit.isPending}
        onClick={() => submit.mutate(items.map((i) => i.id))}
      >
        {done ? "Mettre à jour mon classement" : "Valider mon classement"}
      </button>
      {submit.isSuccess && <p className="text-sm text-green-700">Classement enregistré ✓</p>}
    </section>
  );
}
