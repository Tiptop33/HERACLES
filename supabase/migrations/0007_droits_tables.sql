-- 0007_droits_tables.sql
-- Donner aux rôles de Supabase le droit d'atteindre les tables — et ce droit-là
-- seulement.
--
-- Ce qui manquait. Les migrations précédentes ne posaient aucun `grant`, en
-- comptant sur les privilèges par défaut de Supabase. Or ces privilèges par
-- défaut dépendent du rôle qui crée la table : ceux du rôle `supabase_admin`
-- donnent bien tout à `anon` et `authenticated`, mais ceux du rôle `postgres` —
-- celui qui joue nos migrations — ne donnent que `truncate`, `references` et
-- `trigger`. Pas de `select`.
--
-- Conséquence : l'application ne lisait *aucune* table. La connexion
-- fonctionnait (elle passe par le schéma `auth`), puis la lecture du profil
-- échouait en silence et renvoyait tout le monde vers l'espace chercheur.
--
-- Deux verrous, deux rôles distincts. Le `grant` dit **à quelles tables** on
-- peut s'adresser ; la RLS dit **quelles lignes** on en obtient. Un `grant
-- select` sur une table sans policy ne rend toujours rien : les deux se
-- complètent, l'un ne remplace pas l'autre.

-- ---------------------------------------------------------------------------
-- 1. Fermer d'abord
--    On repart de zéro plutôt que d'ajouter à un existant qu'on ne maîtrise
--    pas : c'est ce qui rend cette migration rejouable et lisible.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. anon : rien
--    Aucun écran ne lit de données sans être connecté. C'est exactement ce qui
--    manquait à l'application d'origine, dont l'API répondait à tout Internet.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. authenticated : lecture de ce que les écrans affichent
--    Les tables absentes de cette liste — `document`, `entreprise`,
--    `loge_membre`, `bubble_brut` — restent hors d'atteinte : aucun écran ne
--    les réclame encore.
-- ---------------------------------------------------------------------------
grant select on
  public.profil,
  public.candidat,
  public.referent,
  public.loge,
  public.offre_emploi,
  public.parametre
to authenticated;

-- Écriture : seulement là où un écran écrit. Son profil (migration 0001), et la
-- fiche des candidats qu'on accompagne (migration 0006). Ni `insert` ni
-- `delete` : aucun écran ne crée ni ne supprime.
grant update on public.profil, public.candidat to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les fonctions dont dépendent les policies
--    Une expression de policy s'évalue avec les droits de l'appelant : sans
--    `execute`, la lecture échoue avant même que la RLS ait tranché.
-- ---------------------------------------------------------------------------
grant execute on function public.referent_courant() to authenticated;
grant execute on function public.referents_visibles() to authenticated;
grant execute on function public.loges_visibles() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. service_role : la clé d'administration
--    Elle contourne déjà la RLS ; lui refuser l'accès aux tables n'aurait
--    aucun sens. C'est par elle que passeront la reprise des données et
--    l'administration des loges.
-- ---------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 6. Et pour les tables à venir
--    Sans cela, la prochaine migration recréerait le problème sans bruit. Les
--    privilèges par défaut ne donnent rien à `anon` ni à `authenticated` : une
--    table neuve naît fermée, et s'ouvre explicitement, table par table.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
