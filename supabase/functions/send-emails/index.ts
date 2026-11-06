import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildEmail, providerFromEnv } from "../_shared/email.ts";

// Vide l'outbox. Réservé à un appelant disposant de la clé service (cron, appel manuel).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
  if (req.headers.get("authorization") !== `Bearer ${serviceKey}`)
    return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL") as string, serviceKey);
  const provider = providerFromEnv(Deno.env.get("EMAIL_DRIVER"));
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:3000/").replace(/\/?$/, "/");

  const { data: rows, error } = await db
    .from("email_outbox")
    .select("id, to_email, kind, payload")
    .is("sent_at", null)
    .order("id")
    .limit(100);
  if (error) return json({ error: "server_error", message: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const participantId = row.payload?.participant_id as string | undefined;
    const { data: p } = participantId
      ? await db
          .from("participants")
          .select("name, token, is_admin")
          .eq("id", participantId)
          .maybeSingle()
      : { data: null };
    // Page réinitialisée entre-temps (plus de jeton) ou type inconnu : on abandonne sans envoyer.
    const email = p?.token
      ? buildEmail(row, `${appUrl}${p.is_admin ? "a" : "p"}/${p.token}`, p.name as string)
      : null;
    try {
      if (email) await provider.send(email);
      await db.from("email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      if (email) sent++;
    } catch (e) {
      failed++;
      console.error(`[send-emails] échec id=${row.id}:`, e);
    }
  }
  return json({ sent, failed, discarded: (rows?.length ?? 0) - sent - failed });
});
