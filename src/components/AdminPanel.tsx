import { useAdminReset, useAdminView } from "../lib/api";
import { card } from "./Layout";

export function AdminPanel({ adminToken, started }: { adminToken: string; started: boolean }) {
  const q = useAdminView(adminToken);
  const reset = useAdminReset(adminToken);
  if (!q.data) return null;
  const waiting = q.data.participants.filter((p) => !p.joined);
  const unrevealed = q.data.participants.filter((p) => p.joined && !p.revealed);
  return (
    <section className={`${card} space-y-3 border-red-300`} data-testid="admin-panel">
      <h2 className="font-bold">Espace organisateur</h2>
      <p className="text-sm">
        <b>Pas encore rejoint :</b>{" "}
        {waiting.length ? waiting.map((p) => p.name).join(", ") : "personne 🎉"}
      </p>
      <p className="text-sm">
        <b>Pas encore découvert leur tirage :</b>{" "}
        {unrevealed.length ? unrevealed.map((p) => p.name).join(", ") : "personne 🎉"}
      </p>
      <ul className="divide-y text-sm">
        {q.data.participants
          .filter((p) => !p.is_admin)
          .map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span>
                {p.name} {p.joined ? "✅" : "⏳"}
              </span>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                disabled={!p.joined || started || reset.isPending}
                title={started ? "Impossible : le Secret Santa est lancé" : "Réinitialiser sa page"}
                onClick={() => {
                  if (window.confirm(`Réinitialiser la page de ${p.name} ?`)) reset.mutate(p.id);
                }}
              >
                Réinitialiser
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
