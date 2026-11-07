import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { btn, card, Page } from "../../components/Layout";
import { claimParticipant, useSantaPublic } from "../../lib/api";
import { loadSpaces, saveSpace } from "../../lib/spaces";

export const Route = createFileRoute("/s/$code")({ component: Join });

function Join() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const q = useSantaPublic(code);
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Déjà rejoint depuis ce navigateur : on redirige vers l'espace personnel mémorisé.
  useEffect(() => {
    const known = loadSpaces().find((sp) => sp.code === code);
    if (!known) return;
    if (known.kind === "a")
      navigate({ to: "/a/$token", params: { token: known.token }, replace: true });
    else navigate({ to: "/p/$token", params: { token: known.token }, replace: true });
  }, [code, navigate]);

  async function claim() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const token = await claimParticipant(code, choice);
      const me = q.data?.participants.find((p) => p.id === choice);
      saveSpace({
        token,
        kind: "p",
        name: me?.name ?? "",
        santaName: q.data?.name ?? "",
        code,
        mode: q.data?.mode ?? "classic",
      });
      navigate({ to: "/p/$token", params: { token } });
    } catch {
      setError("Cette place vient d'être prise. Choisis-en une autre.");
      q.refetch();
      setChoice(null);
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <Page title="…" />;
  if (!q.data) return <Page title="Secret Santa introuvable" />;

  return (
    <Page kicker={q.data.name} title="Qui es-tu ?">
      <div className={`${card} space-y-4`}>
        {q.data.participants.length === 0 ? (
          <p>Tout le monde a déjà rejoint ce Secret Santa.</p>
        ) : (
          <>
            <ul className="grid gap-2">
              {q.data.participants.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={choice === p.id}
                    onClick={() => setChoice(p.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left ${
                      choice === p.id ? "border-red-700 bg-red-50 font-bold" : "border-slate-300"
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-600">
              Ton accès sera mémorisé sur ce navigateur. Une fois ton nom choisi, il n'est plus
              proposé aux autres.
            </p>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <button type="button" className={btn} disabled={!choice || busy} onClick={claim}>
              C'est moi
            </button>
          </>
        )}
      </div>
    </Page>
  );
}
