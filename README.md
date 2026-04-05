# BlocNote

Application web de bloc-note simple, moderne et responsive, avec sauvegarde locale automatique.

## Fonctionnalites

- Creation rapide de notes
- Edition en direct du titre et du contenu
- Suppression d'une note selectionnee
- Recherche par titre ou contenu
- Tags par note pour organiser le contenu
- Filtre par tag dans la liste des notes
- Export des notes en fichier JSON
- Import des notes depuis un fichier JSON
- Sauvegarde automatique dans le navigateur via localStorage
- Application installable (PWA)
- Mode hors-ligne pour les fichiers de l'application
- Interface adaptee desktop et mobile
- Synchronisation cloud via Supabase (connexion email/mot de passe)
- Synchronisation cloud automatique periodique (optionnelle)
- Detection visuelle des conflits local/cloud avant fusion

## Lancer le projet

1. Ouvre le dossier du projet.
2. Lance un serveur statique, par exemple :

```bash
python3 -m http.server 8000
```

3. Ouvre ensuite http://localhost:8000 dans ton navigateur.

## Structure

- index.html : structure de l'interface
- styles.css : design, animations et responsive
- app.js : logique de notes (CRUD local + recherche)
- manifest.webmanifest : configuration PWA (installation)
- sw.js : cache hors-ligne des ressources statiques

## Installation PWA

1. Lance l'application via un serveur local (pas en ouvrant directement le fichier HTML).
2. Ouvre l'application dans un navigateur compatible (Chrome, Edge, etc.).
3. Clique sur "Installer l'application" depuis la barre d'adresse ou le menu du navigateur.

## Synchronisation Cloud (Supabase)

La synchronisation cloud est optionnelle et fonctionne avec Supabase.

1. Cree un projet Supabase.
2. Dans Supabase, copie :
	- `Project URL`
	- `anon public key`
3. Cree la table SQL suivante (SQL Editor) :

```sql
create table if not exists public.note_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.note_snapshots enable row level security;

create policy "owner can read own snapshot"
on public.note_snapshots
for select
using (auth.uid() = user_id);

create policy "owner can upsert own snapshot"
on public.note_snapshots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

4. Dans BlocNote, renseigne URL + Anon Key + email + mot de passe.
5. Clique `Se connecter`.
   - Si le compte n'existe pas, il est cree automatiquement.
   - Selon les reglages Supabase, une verification email peut etre demandee.
6. Utilise :
   - `Envoyer cloud` pour publier tes notes locales.
   - `Recuperer cloud` pour fusionner avec les notes cloud (la version la plus recente gagne par note).
   - `Sync auto activee` + `Frequence (minutes)` pour envoyer regulierement en arriere-plan.

### Conflits

- Un conflit est detecte si une note existe en local et en cloud avec le meme `id` mais un contenu different.
- Les notes en conflit sont marquees dans la liste avec `Conflit local/cloud`.
- Lors de la fusion, la version la plus recente (`updatedAt`) est conservee.
- Quand une note en conflit est selectionnee, tu peux choisir `Garder locale` ou `Garder cloud`.
- Si `Sync auto activee` est activee, BlocNote tente aussi un envoi rapide lors de la fermeture de l'onglet.

## Mise en ligne (telephone)

Le projet est configure pour GitHub Pages via le workflow:
- `.github/workflows/deploy-pages.yml`

URL de production attendue:
- https://paulsadou0.github.io/BlocNote/

Etapes:
1. Commit et push sur `main`.
2. Attendre la fin du workflow `Deploy BlocNote to GitHub Pages` dans l'onglet Actions.
3. Ouvrir l'URL ci-dessus sur le telephone.
4. Installer depuis le bouton `Installer l'app` (ou via le menu du navigateur).
