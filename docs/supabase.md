# Supabase et déploiement — guide pas à pas

Sabsanta est une SPA (React) sans serveur propre : tout passe par Supabase (Postgres + Edge Functions +
Realtime). Le front est publié sur GitHub Pages.

> Les sections **Local** ont été exécutées et vérifiées pendant le développement. Les sections **Cloud** et
> **GitHub Pages** n'ont pas pu être exécutées (elles demandent ton compte) : elles sont écrites d'après la
> CLI et la doc, et sont à valider à la première mise en ligne. Les points à reconfirmer sont signalés ⚠️.

## 1. Développement local

Prérequis : Docker (démon actif, utilisateur dans le groupe `docker`) et bun 1.4.4 (`asdf install`).

```bash
bun install
bun run db:start         # supabase start : Postgres, Realtime, Kong… (1re fois : téléchargements)
bun run db:reset         # rejoue toutes les migrations dans supabase/migrations/
bun run functions:serve  # sert les Edge Functions (à laisser tourner dans un terminal)
bun run dev              # front sur http://localhost:3000
```

`bun run db:start` affiche l'URL de l'API et la clé publishable. Crée `.env.local` (ignoré par git) :

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publishable affichée par supabase start>
```

Analytics, studio et storage sont désactivés dans `supabase/config.toml` (inutiles ici, moins de conteneurs).
Après un ajout ou une modification de `[functions.*]` dans `config.toml`, redémarre `functions:serve`.

### Vider l'outbox d'emails en local

Le driver est « console » : l'email s'affiche dans les logs de `functions:serve`.

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/send-emails \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY affichée par supabase status>"
```

### Tests

```bash
bun run lint && bun check && bun test   # statique + tirage + emails
bun run e2e                              # Playwright ; nécessite db:start + functions:serve
```

## 2. Cloud (supabase.com, offre gratuite)

1. Crée un projet sur <https://supabase.com> (offre gratuite). Note la **référence du projet**, l'**URL** et la
   **clé publishable** (Settings → API).
2. Depuis ce dépôt :

   ```bash
   bunx supabase login
   bunx supabase link --project-ref <ref>
   bunx supabase db push --remote           # applique les migrations
   bunx supabase functions deploy create-santa submit-preferences send-emails
   ```

   ⚠️ Avec la CLI 3, `db push` et `migration list` visent **la base locale par défaut** : sans `--remote`,
   rien n'est envoyé au cloud (et aucun mot de passe n'est demandé). Vérifie avec
   `bunx supabase migration list --remote` : la colonne « remote » doit être remplie.

   Les trois fonctions ont `verify_jwt = false` dans `config.toml` : la sécurité repose sur les jetons
   applicatifs, pas sur un JWT utilisateur (la clé publishable n'est pas un JWT).
3. Secrets des fonctions :

   ```bash
   bunx supabase secrets set APP_URL=https://<utilisateur>.github.io/<dépôt>/ EMAIL_DRIVER=console
   ```

   `APP_URL` sert aux liens dans les emails. Les clés Supabase sont injectées automatiquement.
4. ⚠️ **Realtime** : les messages utilisent des canaux _broadcast publics_ (`inbox:<clé>`), émis par
   `realtime.send(..., private => false)`. Vérifie dans Settings → Realtime que l'accès public aux canaux n'est
   pas désactivé. C'est la partie la plus susceptible de différer entre local et cloud.
5. **Emails sortants** : `send-emails` doit être appelé périodiquement (il n'est pas déclenché tout seul).
   Avec pg_cron + pg_net (à activer dans Database → Extensions) ⚠️ non testé :

   ```sql
   select cron.schedule('send-emails', '* * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/send-emails',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
     )
   $$);
   ```

   Idéalement, place la clé dans Vault plutôt qu'en clair dans la requête.
6. **Vrai fournisseur d'email** : implémente `EmailProvider` (voir `supabase/functions/_shared/email.ts`),
   ajoute un cas dans `providerFromEnv`, puis `supabase secrets set EMAIL_DRIVER=<nom> <CLÉ_API>=…`.
   Tant que ce n'est pas fait, le driver « console » n'envoie rien : les emails restent dans les logs.

⚠️ **Offre gratuite** : le projet est mis en pause après une période d'inactivité (une semaine, à ma
connaissance — à reconfirmer sur la page des tarifs). Il se réveille depuis le tableau de bord ; les données
sont conservées.

## 3. GitHub Pages

Supabase n'héberge pas de front statique (à ma connaissance, non reconfirmé) : le front va sur GitHub Pages.

1. Crée le dépôt GitHub et pousse la branche `main`. ⚠️ Pages gratuit exige en général un dépôt public.
2. Settings → Pages → Source : **GitHub Actions**.
3. Settings → Secrets and variables → Actions → ajoute :
   - `VITE_SUPABASE_URL` : l'URL du projet cloud ;
   - `VITE_SUPABASE_PUBLISHABLE_KEY` : la clé publishable (elle est publique par conception ; la sécurité
     vient du RLS sans policy et des RPC à jeton).
4. Chaque push sur `main` lance `.github/workflows/deploy.yml` : lint, tests, build avec
   `VITE_BASE=/<dépôt>/`, copie de `index.html` en `404.html` (fallback SPA), publication.

Le fallback SPA est nécessaire : sans lui, ouvrir directement `/<dépôt>/p/<jeton>` donnerait une 404 de GitHub.
Vérifié en local avec un serveur qui imite ce comportement (404.html servi avec statut 404).

Domaine personnalisé à la racine : mets `VITE_BASE=/` dans le workflow.
