import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { draw } from "../../supabase/functions/_shared/draw";
import { CopyButton } from "../components/CopyButton";
import { btn, btnGhost, card, Page } from "../components/Layout";
import { absoluteLink, createSanta } from "../lib/api";
import { saveSpace } from "../lib/spaces";
import { parseExclusion, splitNames, useWizard } from "../lib/store";

export const Route = createFileRoute("/create")({ component: Create });

function Create() {
  const w = useWizard();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [result, setResult] = useState<{ code: string; admin_token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [reciprocal, setReciprocal] = useState(true);

  const feasibility = useMemo(() => {
    if (w.names.length < 3) return null;
    return draw({
      participants: w.names,
      exclusions: w.exclusions.map(parseExclusion),
      timeLimitMs: 300,
    });
  }, [w.names, w.exclusions]);

  const commit = () => {
    if (splitNames(draft).length > 0) w.addNames(draft);
    setDraft("");
  };

  async function submit() {
    if (!w.adminName) return;
    setBusy(true);
    setError(null);
    try {
      const idx = (n: string) => w.names.indexOf(n);
      const res = await createSanta({
        name: w.santaName.trim(),
        mode: w.mode,
        participants: w.names,
        adminIndex: idx(w.adminName),
        exclusions: w.exclusions
          .map(parseExclusion)
          .map(([g, r]) => [idx(g), idx(r)] as [number, number]),
      });
      // L'organisateur retrouvera son espace depuis l'accueil, sans avoir à conserver le lien.
      saveSpace({
        token: res.admin_token,
        kind: "a",
        name: w.adminName,
        santaName: w.santaName.trim(),
        code: res.code,
        mode: w.mode,
        total: w.names.length,
      });
      setResult(res);
      setStep(3);
      w.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (step === 3 && result) {
    const share = absoluteLink(`s/${result.code}`);
    const admin = absoluteLink(`a/${result.admin_token}`);
    return (
      <Page title="C'est prêt ! 🎁">
        <div className={`${card} space-y-2`}>
          <h2 className="font-bold">Lien de partage</h2>
          <p className="text-sm text-slate-600">À envoyer à tous les participants.</p>
          <code
            data-testid="share-link"
            className="block break-all rounded bg-slate-100 p-2 text-sm"
          >
            {share}
          </code>
          <CopyButton text={share} />
        </div>
        <div className={`${card} space-y-2 border-red-300`}>
          <h2 className="font-bold">Ton lien d'organisateur</h2>
          <p className="text-sm text-slate-600">
            ✅ Ton accès est mémorisé sur ce navigateur : tu retrouveras ta page depuis l'accueil du
            site. Garde ce lien pour y accéder depuis un autre navigateur ou appareil (il est
            personnel : ne le partage pas).
          </p>
          <code
            data-testid="admin-link"
            className="block break-all rounded bg-slate-100 p-2 text-sm"
          >
            {admin}
          </code>
          <div className="flex gap-2">
            <CopyButton text={admin} />
            <a className={btnGhost} href={admin}>
              Ouvrir ma page
            </a>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Créer un Secret Santa">
      {step === 1 && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-bold">1. Le Secret Santa</h2>
          <input
            aria-label="Nom du Secret Santa"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={w.santaName}
            maxLength={60}
            placeholder="Ex. Noël en famille 2026"
            onChange={(e) => w.setSantaName(e.target.value)}
          />
          <h3 className="pt-2 font-bold">Les participants</h3>
          <p className="text-sm text-slate-600">
            Un nom puis Entrée, ou colle une liste (un nom par ligne). Minimum 3.
          </p>
          <input
            aria-label="Nom du participant"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={draft}
            placeholder="Prénom puis Entrée"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (/[\n,;]/.test(text)) {
                e.preventDefault();
                w.addNames(text);
              }
            }}
          />
          <ul className="flex flex-wrap gap-2">
            {w.names.map((n) => (
              <li
                key={n}
                className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-800"
              >
                {n}
                <button type="button" aria-label={`Retirer ${n}`} onClick={() => w.removeName(n)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={btn}
            disabled={!w.santaName.trim() || w.names.length + splitNames(draft).length < 3}
            onClick={() => {
              commit();
              setStep(2);
            }}
          >
            Suivant
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className={`${card} space-y-3`}>
            <h2 className="font-bold">2. Qui ne doit pas offrir à qui ?</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reciprocal}
                onChange={(e) => setReciprocal(e.target.checked)}
              />
              Interdiction réciproque (couple)
            </label>
            {w.names.map((g) => (
              <div key={g}>
                <div className="text-sm font-medium">{g} ne donne pas à :</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {w.names
                    .filter((r) => r !== g)
                    .map((r) => {
                      const on = w.exclusions.includes(`${g}→${r}`);
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={on}
                          onClick={() => w.toggleExclusion(g, r, reciprocal)}
                          className={`rounded-full border px-3 py-1 text-sm ${
                            on ? "border-red-700 bg-red-700 text-white" : "border-slate-300"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
            {feasibility && !feasibility.ok && (
              <p role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-800">
                Avec ces interdictions, aucun tirage n'est possible
                {feasibility.detail
                  ? ` (${feasibility.detail.join(", ")} ne peut offrir à personne)`
                  : ""}
                .
              </p>
            )}
          </div>

          <div className={`${card} space-y-2`}>
            <h2 className="font-bold">3. Qui es-tu ?</h2>
            <div className="flex flex-wrap gap-3">
              {w.names.map((n) => (
                <label key={n} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="me"
                    checked={w.adminName === n}
                    onChange={() => w.setAdmin(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>

          <div className={`${card} space-y-2`}>
            <h2 className="font-bold">4. Le mode</h2>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="mode"
                checked={w.mode === "classic"}
                onChange={() => w.setMode("classic")}
              />
              <span>
                <b>🎲 Classique</b> : tirage au sort immédiat.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="mode"
                checked={w.mode === "sab"}
                onChange={() => w.setMode("sab")}
              />
              <span>
                <b>💝 Sab</b> : chacun classe ses préférences, puis tirage optimisé.
              </span>
            </label>
          </div>

          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={() => setStep(1)}>
              Retour
            </button>
            <button
              type="button"
              className={btn}
              disabled={busy || !w.adminName || (feasibility !== null && !feasibility.ok)}
              onClick={submit}
            >
              {busy ? "Création…" : "Créer"}
            </button>
          </div>
        </section>
      )}
    </Page>
  );
}
