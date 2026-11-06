import { useEffect, useRef, useState } from "react";
import type { Message } from "../lib/api";
import { btn, card } from "./Layout";

/**
 * Fil de discussion. `mine` = le rôle (santa|child) de l'utilisateur dans ce fil ;
 * `otherLabel` = comment il voit son interlocuteur (nom de l'enfant, ou « Ton Santa » anonyme).
 */
export function Conversation({
  testId,
  title,
  messages,
  mine,
  otherLabel,
  pending,
  onSend,
}: {
  testId: string;
  title: string;
  messages: Message[];
  mine: "santa" | "child";
  otherLabel: string;
  pending: boolean;
  onSend: (body: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    await onSend(body);
    setDraft("");
  }

  return (
    <section className={`${card} space-y-3`} data-testid={testId}>
      <h2 className="font-bold">{title}</h2>
      <ul className="max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && (
          <li className="text-sm text-slate-500">Aucun message pour l'instant.</li>
        )}
        {messages.map((m) => {
          const isMine = m.from === mine;
          return (
            <li key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  isMine ? "bg-red-700 text-white" : "bg-slate-100"
                }`}
              >
                {!isMine && <div className="text-xs font-bold text-slate-500">{otherLabel}</div>}
                {m.body}
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          aria-label={`Message — ${title}`}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className={btn} disabled={pending || !draft.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
