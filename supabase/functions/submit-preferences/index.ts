import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { draw } from "../_shared/draw.ts";

interface Body {
  token: string;
  /** Ids des receveurs, du préféré au moins préféré : tous les candidats, une fois chacun. */
  ranking: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (typeof body?.token !== "string" || !Array.isArray(body.ranking) || body.token.length === 0)
    return json({ error: "invalid_input" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
  );

  const { data: me } = await db
    .from("participants")
    .select("id, santa_id, santas(mode, status)")
    .eq("token", body.token)
    .maybeSingle();
  if (!me) return json({ error: "unauthorized" }, 401);
  const santa = me.santas as unknown as { mode: string; status: string };
  if (santa.mode !== "sab") return json({ error: "not_sab" }, 409);
  if (santa.status !== "open") return json({ error: "already_drawn" }, 409);

  const [{ data: others }, { data: excl }] = await Promise.all([
    db.from("participants").select("id").eq("santa_id", me.santa_id).neq("id", me.id),
    db.from("exclusions").select("giver_id, receiver_id").eq("giver_id", me.id),
  ]);
  const excluded = new Set((excl ?? []).map((e) => e.receiver_id as string));
  const candidates = (others ?? []).map((o) => o.id as string).filter((id) => !excluded.has(id));
  const ranking = body.ranking;
  if (
    ranking.length !== candidates.length ||
    new Set(ranking).size !== ranking.length ||
    ranking.some((id) => !candidates.includes(id))
  )
    return json(
      { error: "invalid_ranking", message: "le classement doit contenir chaque candidat une fois" },
      400,
    );

  await db.from("preferences").delete().eq("giver_id", me.id);
  const { error: e1 } = await db
    .from("preferences")
    .insert(ranking.map((receiver_id, i) => ({ giver_id: me.id, receiver_id, rank: i + 1 })));
  if (e1) return json({ error: "server_error", message: e1.message }, 500);
  await db
    .from("participants")
    .update({ prefs_submitted_at: new Date().toISOString() })
    .eq("id", me.id);

  // Dernier classement ? Tout le monde doit avoir rejoint et classé.
  const { count: pending } = await db
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("santa_id", me.santa_id)
    .is("prefs_submitted_at", null);
  if (pending !== 0) return json({ drawn: false });

  // Verrou : un seul appel concurrent passe de 'open' à 'started'.
  const { data: locked } = await db
    .from("santas")
    .update({ status: "started" })
    .eq("id", me.santa_id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!locked) return json({ drawn: true }); // un autre appel s'en charge

  const unlock = async (message: string) => {
    await db.from("santas").update({ status: "open" }).eq("id", me.santa_id);
    return json({ error: "draw_failed", message }, 500);
  };

  const [{ data: everyone }, { data: allExcl }, { data: allPrefs }] = await Promise.all([
    db.from("participants").select("id, email").eq("santa_id", me.santa_id),
    db
      .from("exclusions")
      .select("giver_id, receiver_id, participants!exclusions_giver_id_fkey(santa_id)"),
    db
      .from("preferences")
      .select("giver_id, receiver_id, rank, participants!preferences_giver_id_fkey(santa_id)"),
  ]);
  const ids = (everyone ?? []).map((p) => p.id as string);
  const inSanta = (r: { participants: unknown }) =>
    (r.participants as { santa_id: string } | null)?.santa_id === me.santa_id;
  const preferences: Record<string, string[]> = {};
  for (const p of (allPrefs ?? [])
    .filter(inSanta)
    .sort((a, b) => (a.rank as number) - (b.rank as number)))
    (preferences[p.giver_id as string] ??= []).push(p.receiver_id as string);

  const res = draw({
    participants: ids,
    exclusions: (allExcl ?? [])
      .filter(inSanta)
      .map((e) => [e.giver_id as string, e.receiver_id as string]),
    preferences,
  });
  if (!res.ok) return await unlock(res.reason);

  const { error: e2 } = await db
    .from("assignments")
    .insert(
      Object.entries(res.assignments).map(([giver_id, receiver_id]) => ({ giver_id, receiver_id })),
    );
  if (e2) return await unlock(e2.message);

  // Email « c'est parti » pour ceux qui ont laissé leur adresse.
  const mails = (everyone ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      to_email: p.email as string,
      kind: "started",
      payload: { participant_id: p.id },
    }));
  if (mails.length > 0) await db.from("email_outbox").insert(mails);

  return json({ drawn: true, maxRank: res.maxRank, totalCost: res.totalCost });
});
