import { useState } from "react";
import {
  absoluteLink,
  type ParticipantView,
  useInbox,
  useParticipantView,
  useTokenMutation,
} from "../lib/api";
import { Conversation } from "./Conversation";
import { CopyButton } from "./CopyButton";
import { btn, card, Page } from "./Layout";
import { Ranking } from "./Ranking";
import { Roulette } from "./Roulette";

export function ParticipantSpace({ token, linkPath }: { token: string; linkPath: string }) {
  const q = useParticipantView(token);
  if (q.isLoading) return <Page title="…" />;
  if (q.error || !q.data)
    return (
      <Page title="Lien invalide">
        <p className="text-center">
          Ce lien n'est plus valide (réinitialisé par l'organisateur ?).
        </p>
      </Page>
    );
  return <Space token={token} view={q.data} linkPath={linkPath} />;
}

function Space({
  token,
  view,
  linkPath,
}: {
  token: string;
  view: ParticipantView;
  linkPath: string;
}) {
  const { me, santa, progress } = view;
  const q = useParticipantView(token);
  const reveal = useTokenMutation<void>(token, "mark_revealed", () => ({}));
  const sendToChild = useTokenMutation<string>(token, "send_message", (p_body) => ({
    p_direction: "to_child",
    p_body,
  }));
  const sendToSanta = useTokenMutation<string>(token, "send_message", (p_body) => ({
    p_direction: "to_santa",
    p_body,
  }));
  useInbox(me.inbox_key, token);
  const saveWishes = useTokenMutation<string>(token, "set_wishes", (p_wishes) => ({ p_wishes }));
  const saveEmail = useTokenMutation<string>(token, "set_email", (p_email) => ({ p_email }));
  const [wishes, setWishes] = useState(me.wishes);
  const [email, setEmail] = useState(me.email ?? "");
  const [spinning, setSpinning] = useState(false);

  async function launch() {
    await reveal.mutateAsync();
    await q.refetch();
    setSpinning(true);
  }

  const started = santa.status === "started";
  const canReveal = view.has_assignment && !me.revealed;

  const banner = (
    <div className={`${card} border-amber-300 bg-amber-50 text-sm`}>
      🔑 Garde ce lien, c'est ta clé : sans lui, tu ne pourras pas revenir sur cette page.
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate">{absoluteLink(linkPath)}</code>
        <CopyButton text={absoluteLink(linkPath)} />
      </div>
    </div>
  );

  const sabWaiting = santa.mode === "sab" && !view.has_assignment;
  const mustRank = sabWaiting && !me.prefs_submitted;

  if (mustRank) {
    return (
      <Page title={`Salut ${me.name} 👋`}>
        {banner}
        <Ranking token={token} view={view} />
      </Page>
    );
  }

  return (
    <Page title={`Salut ${me.name} 👋`}>
      {banner}

      <div className={`${card} space-y-3 text-center`}>
        {canReveal && !spinning && (
          <>
            <p>Le tirage a été fait. Prêt à découvrir à qui tu offres un cadeau ?</p>
            <button type="button" className={btn} disabled={reveal.isPending} onClick={launch}>
              🎲 Lancer le tirage
            </button>
          </>
        )}
        {spinning && view.child && (
          <Roulette
            names={view.candidates.map((c) => c.name)}
            target={view.child.name}
            onDone={() => {
              setSpinning(false);
            }}
          />
        )}
        {!spinning && me.revealed && view.child && (
          <div>
            <p className="text-slate-600">Tu offres un cadeau à</p>
            <p data-testid="child-name" className="text-4xl font-bold text-red-700">
              {view.child.name}
            </p>
            {view.child.wishes ? (
              <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-left text-sm">
                <b>Ses souhaits :</b> {view.child.wishes}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Il/elle n'a pas encore écrit de souhaits.
              </p>
            )}
          </div>
        )}
        {sabWaiting && (
          <p data-testid="sab-waiting">
            Classement enregistré ✓ Le tirage aura lieu quand tout le monde aura donné le sien (
            {progress.prefs_done}/{progress.total}).
          </p>
        )}
      </div>

      {sabWaiting && <Ranking token={token} view={view} />}

      {view.has_assignment && me.revealed && view.child && (
        <Conversation
          testId="chat-child"
          title={`Discuter avec ${view.child.name}`}
          messages={view.to_child}
          mine="santa"
          otherLabel={view.child.name}
          pending={sendToChild.isPending}
          onSend={sendToChild.mutateAsync}
        />
      )}
      {view.has_assignment && (
        <Conversation
          testId="chat-santa"
          title="Discuter avec ton Santa 🎅 (anonyme)"
          messages={view.to_santa}
          mine="child"
          otherLabel="Ton Santa 🎅"
          pending={sendToSanta.isPending}
          onSend={sendToSanta.mutateAsync}
        />
      )}

      <div className={`${card} space-y-2`}>
        <h2 className="font-bold">Mes souhaits</h2>
        <textarea
          aria-label="Mes souhaits"
          className="w-full rounded-lg border border-slate-300 p-2"
          rows={3}
          value={wishes}
          onChange={(e) => setWishes(e.target.value)}
        />
        <button
          type="button"
          className={btn}
          disabled={saveWishes.isPending}
          onClick={() => saveWishes.mutate(wishes)}
        >
          {saveWishes.isSuccess ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </div>

      <div className={`${card} space-y-2`}>
        <h2 className="font-bold">Mon email (facultatif)</h2>
        <p className="text-sm text-slate-600">
          Pour être prévenu d'un nouveau message ou du lancement.
        </p>
        <input
          aria-label="Mon email"
          type="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="button"
          className={btn}
          disabled={saveEmail.isPending}
          onClick={() => saveEmail.mutate(email)}
        >
          {saveEmail.isSuccess ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </div>

      <div className={`${card} text-sm`} data-testid="progress">
        <b>Avancement</b> : {progress.joined}/{progress.total} ont rejoint, {progress.revealed}/
        {progress.total} ont découvert leur tirage.
        {started && <p className="mt-1 font-bold text-green-700">🎉 Le Secret Santa est lancé !</p>}
      </div>
    </Page>
  );
}
