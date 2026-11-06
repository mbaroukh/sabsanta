import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { draw } from "../_shared/draw.ts";

interface Body {
  mode: "classic" | "sab";
  participants: string[];
  /** Index (dans participants) de l'organisateur. */
  adminIndex: number;
  /** Paires [donneur, receveur] (index) interdites. */
  exclusions: [number, number][];
}

function validate(b: Body): string | null {
  if (b?.mode !== "classic" && b?.mode !== "sab") return "mode invalide";
  if (!Array.isArray(b.participants) || b.participants.length < 3 || b.participants.length > 60)
    return "il faut entre 3 et 60 participants";
  const names = b.participants.map((p) => (typeof p === "string" ? p.trim() : ""));
  if (names.some((n) => n.length === 0 || n.length > 60)) return "nom invalide";
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return "noms en double";
  if (!Number.isInteger(b.adminIndex) || b.adminIndex < 0 || b.adminIndex >= names.length)
    return "organisateur invalide";
  const ex = Array.isArray(b.exclusions) ? b.exclusions : [];
  for (const e of ex)
    if (!Array.isArray(e) || e.some((i) => !Number.isInteger(i) || i < 0 || i >= names.length))
      return "exclusion invalide";
  return null;
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
  const problem = validate(body);
  if (problem) return json({ error: "invalid_input", message: problem }, 400);

  const names = body.participants.map((p) => p.trim());
  const exclusions = (body.exclusions ?? []).filter(([g, r]) => g !== r);

  // On tire (ou, en Sab, on vérifie la faisabilité) avant toute écriture : tirage impossible = refus.
  const res = draw({
    participants: names,
    exclusions: exclusions.map(([g, r]) => [names[g] as string, names[r] as string]),
  });
  if (!res.ok)
    return json({ error: "draw_impossible", reason: res.reason, detail: res.detail }, 422);
  const assignments: Record<string, string> | null =
    body.mode === "classic" ? res.assignments : null;

  const db = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
  );
  const fail = async (santaId: string | null, message: string) => {
    if (santaId) await db.from("santas").delete().eq("id", santaId); // cascade
    return json({ error: "server_error", message }, 500);
  };

  const { data: santa, error: e1 } = await db
    .from("santas")
    .insert({ mode: body.mode, status: assignments ? "drawn" : "open" })
    .select("id, code, admin_token")
    .single();
  if (e1 || !santa) return json({ error: "server_error", message: e1?.message }, 500);

  // Le jeton de l'organisateur sert aussi de jeton d'admin : un seul lien.
  const { data: rows, error: e2 } = await db
    .from("participants")
    .insert(
      names.map((name, i) => ({
        santa_id: santa.id,
        name,
        is_admin: i === body.adminIndex,
        ...(i === body.adminIndex
          ? {
              token: santa.admin_token,
              claimed_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            }
          : {}),
      })),
    )
    .select("id, name");
  if (e2 || !rows) return await fail(santa.id, e2?.message ?? "participants");
  const idOf = new Map(rows.map((r) => [r.name as string, r.id as string]));

  if (exclusions.length > 0) {
    const { error } = await db.from("exclusions").insert(
      exclusions.map(([g, r]) => ({
        giver_id: idOf.get(names[g] as string),
        receiver_id: idOf.get(names[r] as string),
      })),
    );
    if (error) return await fail(santa.id, error.message);
  }
  if (assignments) {
    const { error } = await db.from("assignments").insert(
      Object.entries(assignments).map(([g, r]) => ({
        giver_id: idOf.get(g),
        receiver_id: idOf.get(r),
      })),
    );
    if (error) return await fail(santa.id, error.message);
  }
  return json({ code: santa.code, admin_token: santa.admin_token });
});
