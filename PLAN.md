# Plan — sabsanta

## Contexte

Dossier vide (`/home/mike/Documents/projets/sabsanta`, pas de git). Objectif : un Secret Santa sans email obligatoire, avec un « Mode Sab » où chacun classe ses préférences avant un tirage optimisé, messagerie anonyme santa ↔ enfant, et une page admin. Front seul (SPA), backend Supabase gratuit.

Décisions prises avec l'utilisateur :

- Portée : tout, par jalons vérifiés.
- Emails : fournisseur choisi plus tard → outbox + interface, driver « console » pour l'instant.
- Mode classique : « démarré » quand tous les participants ont vu leur enfant.
- Binômes réciproques (A→B et B→A) : **interdits** (contrainte stricte).

Faits vérifiés (commandes lancées) :

- bun 1.4.4 installé via asdf ; `bun check` existe (« Type check a TypeScript project… reports the same errors as tsc »). Attention : `bun check` exécute le script `check` du package.json s'il existe → **ne pas créer de script `check`**.
- Dernières versions npm aujourd'hui : `@playwright/test` 1.65.0, `@biomejs/biome` 2.6.5, `vite` 8.3.6, `tailwindcss` 4.3.4, `@tanstack/react-router` 1.170.46, `supabase` (CLI) 3.0.0, `motion` 14.9.1.
- Docker 29.1.3 installé et actif (utilisateur dans le groupe `docker`) : la CLI Supabase l'utilise directement, pas de Podman (décision utilisateur, ne pas démarrer podman.socket).
- Hébergement : Supabase n'héberge pas de front statique (à ma connaissance, à reconfirmer dans la doc) → **GitHub Pages**.

## 1. Scaffold & outillage

- `git init`, `.gitignore`, `.tool-versions` (`bun 1.4.4`).
- `package.json` : react, react-dom, @tanstack/react-router + `@tanstack/router-plugin` (vite), @tanstack/react-query, zustand, @supabase/supabase-js, motion ; dev : vite, @vitejs/plugin-react, tailwindcss + @tailwindcss/vite, typescript, @biomejs/biome 2.6.5, `@playwright/test` **épinglé exact `1.65.0`** (pas de `^`), `supabase` CLI.
- `vite.config.ts` : port 3000 (`strictPort`), plugin router avec `routesDirectory: "src/pages"`, `base` paramétrable (`/sabsanta/` pour Pages).
- `biome.json` : ignore `src/routeTree.gen.ts`, activer le parsing des directives Tailwind (option à vérifier dans le schéma Biome 2.6).
- `bunfig.toml` : restreindre `bun test` à `src/` + `supabase/functions` pour ne pas ramasser les `e2e/*.spec.ts` Playwright (option exacte à vérifier).
- Scripts : `dev`, `build`, `preview`, `lint`, `format`, `test`, `e2e`, `db:start`, `db:reset`, `functions:serve`.
- `AGENTS.md` : paragraphe « Fiabilité » fourni en tête, puis uniquement le non-inférable : modèle de sécurité par jetons (pas d'accès direct aux tables), où vit la logique de tirage et pourquoi, règle « pas de script `check` », Playwright épinglé volontairement, contraintes Supabase free (pause après inactivité), GH Pages + fallback SPA.

## 2. Modèle de données (Supabase, `supabase/migrations/`)

Tables (RLS activée partout, **aucune policy anon** → aucun accès direct) :

- `santas` : id, `code` (public, court), `admin_token`, mode `classic|sab`, status `open|drawn|started`, created_at.
- `participants` : id, santa_id, name, is_admin, `token` (null tant que non réclamé), `inbox_key`, claimed_at, revealed_at, prefs_submitted_at, email, wishes, last_seen_at.
- `exclusions` (giver_id, receiver_id), `preferences` (giver_id, receiver_id, rank), `assignments` (giver_id, receiver_id), `messages` (assignment_id, from_role `santa|child`, body, created_at), `email_outbox`.
- Identifiants courts : fonction SQL `gen_short_id()` = 16 octets aléatoires (pgcrypto) encodés base62 → 22 caractères alphanum.

Accès : fonctions `security definer` appelées via `supabase.rpc`, toutes authentifiées par jeton :
`get_santa_public(code)` (participants non réclamés), `claim_participant(code, participant_id)` → token, `get_participant_view(token)` (enfant si révélé, souhaits de l'enfant, progression X/N connectés & ayant choisi, conversations), `set_email`, `set_wishes`, `mark_revealed` (+ passage `started` en classique si tous révélés), `send_message`, `touch` (last_seen), `get_admin_view(admin_token)`, `admin_reset_participant` (interdit si `started` : vide token, prefs, email, révélation).
Temps réel : trigger sur `messages` → `realtime.send(...)` sur le topic public `inbox:<inbox_key>` du destinataire (fonction à vérifier dans la version Supabase installée) ; idem événement « santa démarré ». Le front s'abonne au canal broadcast correspondant.
Email sur réponse : si destinataire a un email et `last_seen_at` > 2 min → ligne dans `email_outbox`.

## 3. Tirage (TypeScript, testé avec bun)

- Module pur `supabase/functions/_shared/draw.ts` (+ `draw.test.ts`).
- Contraintes dures : pas soi-même, exclusions admin, pas de réciproque. Cas impossible (ex. n=2) détecté et remonté clairement — validé aussi dans l'UI de création.
- Classique : backtracking randomisé.
- Sab : coût = rang de préférence ; branch & bound (n typique < 30) minimisant d'abord le rang max puis la somme, départage aléatoire, avec garde-fou temps.
- Edge Functions : `create-santa` (crée santa, participants, exclusions, admin réclamé, tirage si classique ; retourne code + admin_token) et `submit-preferences` (enregistre ; si dernier, verrou + tirage + `started` + outbox « c'est parti »). `send-emails` : lit l'outbox, interface `EmailProvider` avec driver console (Brevo/Resend plus tard).

## 4. Front (`src/`)

- Routes `src/pages/` : `index.tsx` (accueil), `create.tsx` (assistant), `s/$code.tsx` (« qui es-tu ? »), `p/$token.tsx` (participant), `a/$token.tsx` (admin = vue participant + panneau admin).
- `src/lib/supabase.ts` (env `VITE_SUPABASE_URL`, clé publishable/anon), `src/lib/api.ts` (hooks tanstack-query autour des RPC), store zustand de l'assistant de création (persisté localStorage).
- Création efficace : saisie rapide (Entrée = participant suivant, collage d'une liste multi-lignes), matrice/chips d'exclusions avec option « réciproque » (couple), radio « c'est moi », choix du mode, écran final avec URL de partage + URL admin (boutons copier).
- Participant : écran de classement drag & drop (Sab, obligatoire avant tout), bouton « Lancer le tirage » → animation roulette sur les noms (sauf soi) qui s'arrête sur l'enfant, souhaits, email optionnel, progression, deux conversations live.
- Ambiance : illustrations SVG faites main (sapin, cadeaux, flocons) + motion design (`motion`, neige animée, transitions). Je ne peux pas générer d'images raster ; je ferai des SVG/CSS.
- Les jetons étant dans l'URL : rappel visible « garde ce lien, c'est ta clé ».

## 5. Déploiement & config Supabase (guide pas-à-pas dans `docs/supabase.md`)

- Local : `bunx supabase init/start` (Docker), migrations, `functions serve`.
- Cloud : créer le projet sur supabase.com (free), `supabase login` / `link` / `db push` / `functions deploy`, récupérer URL + clé publishable → secrets GitHub.
- GitHub Pages : workflow Actions (setup bun 1.4.4, build, copie `index.html` → `404.html` pour le fallback SPA, deploy).

## Jalons (chacun vérifié avant le suivant)

1. Scaffold + outillage → `bun install`, `bun check`, `bun run lint`, `bun test`, `bun run dev` répond sur :3000.
2. Migrations + RPC + supabase local → `supabase db reset` passe.
3. Tirage + tests unitaires (cas impossibles, réciproques, exclusions, optimalité sur petits cas par force brute).
4. Création + claim + vue participant/admin (classique).
5. Mode Sab + préférences + tirage serveur.
6. Messagerie temps réel + outbox email.
7. Accueil animé, polish, workflow Pages, `docs/supabase.md`.

## Vérification

- `bun check`, `bun run lint`, `bun test` (tirage).
- Playwright e2e contre Supabase local : création classique 4 participants → claim par 4 contextes navigateur → révélation → message santa→enfant reçu en live ; création Sab → 4 classements → tirage → « démarré » ; admin reset d'un participant avant démarrage.
- Je ne déclarerai rien comme passant sans l'avoir exécuté ; la partie cloud (création du projet Supabase, secrets GitHub) nécessitera tes actions, je te guiderai.
