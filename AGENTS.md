# AGENTS.md — sabsanta

## Fiabilité

Ne déclare jamais qu'une chose fonctionne sans l'avoir exécutée. Si un test échoue ou qu'une étape est sautée, dis-le avec la sortie. Avant de supprimer ou d'écraser, regarde la cible. Les actions irréversibles ou sortantes se confirment d'abord.

## Non-inférable

- **Sécurité par jetons** : RLS activée partout, aucune policy anon. Tout passe par des fonctions RPC `security definer` authentifiées par jeton (participant ou admin). Jamais d'accès direct aux tables depuis le front.
- **Tirage** : logique pure dans `supabase/functions/_shared/draw.ts` (testée avec `bun test`), exécutée côté serveur par les Edge Functions (le client ne doit jamais connaître les affectations des autres).
- **Pas de script `check`** dans package.json : `bun check` l'exécuterait au lieu du typecheck.
- **Playwright épinglé exactement** à 1.65.0 (volontaire, pas de `^`).
- **Supabase local** : via Docker (`bun run db:start`), pas Podman. Analytics/studio/storage désactivés dans `supabase/config.toml`.
- **Droits `service_role` explicites** : le projet cloud a « Automatically expose new tables » désactivé, donc les tables ne reçoivent aucun droit par défaut (alors qu'en local si). Les migrations `*_grant_service_role*` accordent ce qu'il faut aux Edge Functions ; toute nouvelle table/fonction utilisée par une fonction doit être couverte. Tester sur le cloud, pas seulement en local.
- **CLI Supabase 3** : `db push`, `migration list`, `db query` visent le **local par défaut** ; ajouter `--remote` pour le cloud.
- **Supabase free** : le projet se met en pause après inactivité.
- **GitHub Pages** : `base` via `VITE_BASE`, et `index.html` copié en `404.html` pour le fallback SPA.
- Binômes réciproques interdits (contrainte stricte du tirage).
