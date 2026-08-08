-- ---------------------------------------------------------------------------
-- 0023 — les tâches de Bubble entrent dans le journal
--
-- Ce que ça change : les 467 tâches saisies dans Bubble depuis mars 2023
-- rejoignent le journal des candidats. Jusqu'ici elles dormaient en JSON dans
-- `bubble_brut`, illisibles depuis l'application ; l'onglet « Suivi & tâches »
-- d'un candidat suivi de longue date s'ouvrait sur « rien de noté ».
--
-- CE QUE LE RELEVÉ DU 7 AOÛT A MANQUÉ
--
-- `docs/MAJBUBBLE.md` annonçait « une tâche, sur 107 candidats ». C'était lu
-- du mauvais côté du lien. Le champ `candidat.TACHES` — la liste inverse — est
-- effectivement renseigné sur une seule fiche ; mais le lien qui compte est
-- porté par la tâche elle-même, dans son champ `Num CANDIDAT tach`. Relevé du
-- 8 août 2026 : **467 tâches, sur 87 candidats**, la plus récente du 30
-- juillet. Il y a bien un historique de suivi à sauver.
--
-- Le type s'appelle `tache` au singulier — et non `TACHES`, qui est le nom du
-- champ. Il n'est pas exposé par la base **en service** (HTTP 404), mais il
-- l'est par celle de **l'éditeur**, qui le tient à jour. Les identifiants sont
-- communs aux deux bases : les 87 candidats visés existent tous dans la base
-- en service, et les 7 auteurs aussi. La reprise en brut le ramasse donc déjà,
-- en passe 3 ; il ne manquait que de le déplier.
--
-- CE QUE LE DÉPLIAGE CONSERVE
--
--   Bubble                  HERACLES
--   ─────────────────────   ────────────────────────────────────────────
--   _id                     suivi.bubble_id     — pour rejouer sans doubler
--   Num CANDIDAT tach[0]    suivi.candidat_id   — toujours un seul candidat
--   Created By              suivi.auteur_id     — la fiche, pas le compte
--   Date                    suivi.fait_le       — ramenée au jour de Paris
--   Titre                   suivi.texte         — jusqu'à 1 464 caractères
--   ETAT                    suivi.etat          — voir ci-dessous
--
-- POURQUOI UNE COLONNE `etat` ET NON LA COLONNE `nature`
--
-- `nature` dit *ce qui a eu lieu* — « Appel », « Entretien ». `ETAT` dit *où
-- ça en est* — « En cours » (434), « Terminer » (28), « En attente » (3),
-- « Réalisé », « A vérifier ». Deux questions, deux colonnes : les verser dans
-- la même ferait perdre les 434 tâches ouvertes dans la masse des notes, et
-- c'est précisément ce qui reste à faire.
--
-- Les notes saisies dans HERACLES n'ont pas d'état, et n'en auront pas : le
-- journal se lit, il ne se coche pas (0021). La colonne ne sert qu'à ne pas
-- perdre ce que Bubble portait.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. L'état, tel que Bubble le portait
-- ---------------------------------------------------------------------------
alter table public.suivi add column if not exists etat text;

comment on column public.suivi.etat is
  'Où en est la tâche, repris de Bubble (« En cours », « Terminer »…). Vide '
  'pour les notes saisies dans HERACLES : un journal se lit, il ne se coche pas.';

-- Ce qui reste ouvert, c'est ce qu'on cherche : l'index sert cette question-là.
create index if not exists suivi_etat_idx on public.suivi (etat) where etat is not null;

-- ---------------------------------------------------------------------------
-- 2. Déplier `bubble_brut` dans le journal
--
--    Rejouable, comme toute la reprise : une tâche déjà déversée est mise à
--    jour, jamais dupliquée. C'est `bubble_id` qui la reconnaît — la colonne
--    que 0021 avait posée en l'attendant.
--
--    Elle ne lit pas Bubble : elle lit `bubble_brut`, que la reprise remplit.
--    Les deux étapes restent séparées, et celle-ci se rejoue sans réseau.
-- ---------------------------------------------------------------------------
create or replace function public.deverser_taches_bubble()
returns table (
  /** Lignes écrites dans le journal — créées ou mises à jour. */
  deversees      bigint,
  /** Parmi elles, celles qui n'y étaient pas. */
  creees         bigint,
  /** Tâches laissées de côté : leur candidat n'est pas en base. */
  sans_candidat  bigint,
  /** Tâches écrites, mais dont l'auteur n'a pas été retrouvé. */
  sans_auteur    bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  ecrites bigint;
  neuves  bigint;
begin
  with brut as (
    select b.donnees as d
      from public.bubble_brut b
     where b.type_bubble = 'tache'
       and b.donnees->>'_id' is not null
  ),
  posee as (
    insert into public.suivi
      (bubble_id, candidat_id, auteur_id, fait_le, etat, texte, cree_le)
    select
      brut.d->>'_id',
      c.id,
      r.id,
      -- Bubble donne un instant UTC ; ce qu'on veut est le jour civil français.
      -- Sans le fuseau, « minuit le 15 mars » se lit « 14 mars » sur un serveur
      -- en UTC — un décalage d'un jour sur la moitié des lignes.
      coalesce(
        ((brut.d->>'Date')::timestamptz         at time zone 'Europe/Paris')::date,
        ((brut.d->>'Created Date')::timestamptz at time zone 'Europe/Paris')::date,
        current_date),
      nullif(btrim(brut.d->>'ETAT'), ''),
      -- `texte` ne peut pas être vide. Aucune tâche ne l'est aujourd'hui ;
      -- si l'une le devenait, mieux vaut une ligne qui le dit qu'une perdue.
      coalesce(nullif(btrim(brut.d->>'Titre'), ''), '(tâche sans intitulé)'),
      coalesce((brut.d->>'Created Date')::timestamptz, now())
      from brut
      -- Le lien est porté par la tâche, et il n'en désigne qu'un : sur les 467
      -- relevées, pas une ne vise deux candidats.
      join public.candidat c
        on c.bubble_id = nullif(btrim(brut.d #>> '{Num CANDIDAT tach,0}'), '')
      left join public.referent r
        on r.bubble_id = nullif(btrim(brut.d->>'Created By'), '')
    on conflict (bubble_id) do update set
      candidat_id = excluded.candidat_id,
      auteur_id   = excluded.auteur_id,
      fait_le     = excluded.fait_le,
      etat        = excluded.etat,
      texte       = excluded.texte
    returning (xmax = 0) as creee
  )
  select count(*), count(*) filter (where posee.creee)
    into ecrites, neuves
    from posee;

  return query
    select
      ecrites,
      neuves,
      (select count(*)
         from public.bubble_brut b
        where b.type_bubble = 'tache'
          and not exists (
            select 1 from public.candidat c
             where c.bubble_id = nullif(btrim(b.donnees #>> '{Num CANDIDAT tach,0}'), ''))),
      (select count(*)
         from public.bubble_brut b
        where b.type_bubble = 'tache'
          and not exists (
            select 1 from public.referent r
             where r.bubble_id = nullif(btrim(b.donnees->>'Created By'), ''))
          and exists (
            select 1 from public.candidat c
             where c.bubble_id = nullif(btrim(b.donnees #>> '{Num CANDIDAT tach,0}'), '')));
end
$$;

comment on function public.deverser_taches_bubble() is
  'Déplie les tâches Bubble de `bubble_brut` dans le journal des candidats. '
  'Rejouable : une tâche déjà déversée est mise à jour, jamais dupliquée. '
  'Réservée à l''exploitation — la reprise l''appelle, l''application jamais.';

-- Personne ne l'appelle depuis l'application : ni un référent, ni un
-- administrateur. C'est une opération de reprise, elle passe par la clé de
-- service — même discipline que `rattacher_les_comptes_orphelins()` (0014).
revoke all on function public.deverser_taches_bubble() from public, anon, authenticated;
grant execute on function public.deverser_taches_bubble() to service_role;

-- ---------------------------------------------------------------------------
-- 3. L'état remonte jusqu'à l'écran
--    Les deux fonctions de lecture (0021, 0022) rendent une colonne de plus.
--    Elles sont redéfinies ici — donc après elles dans l'ordre des migrations,
--    y compris au second passage.
-- ---------------------------------------------------------------------------
drop function if exists public.suivi_du_candidat(uuid);

create function public.suivi_du_candidat(candidat uuid)
returns table (
  id          uuid,
  fait_le     date,
  nature      text,
  etat        text,
  texte       text,
  auteur_nom  text,
  /** Le mien : l'écran ne propose de corriger que ce qu'on a écrit. */
  c_est_moi   boolean,
  cree_le     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
   where s.candidat_id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_du_candidat(uuid) is
  'Le journal d''un candidat, du plus récent au plus ancien, pour qui a le '
  'droit de voir sa fiche (même règle que 0020). Écrire passe par la table, '
  'donc par la RLS : le référent et le parrain seulement.';

revoke all on function public.suivi_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_du_candidat(uuid) to authenticated;

drop function if exists public.suivi_de_la_loge();

create function public.suivi_de_la_loge()
returns table (
  candidat_id uuid,
  id          uuid,
  fait_le     date,
  nature      text,
  etat        text,
  texte       text,
  auteur_nom  text,
  c_est_moi   boolean,
  cree_le     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.candidat_id, s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
   where public.est_admin()
      or c.referent_id = public.referent_courant()
      or c.parrain_id  = public.referent_courant()
      or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_de_la_loge() is
  'Toutes les notes de suivi que l''appelant a le droit de lire, du plus '
  'récent au plus ancien. Même règle que suivi_du_candidat() : elle épargne '
  'd''ouvrir cent sept fiches, elle n''ouvre rien de plus.';

revoke all on function public.suivi_de_la_loge() from public, anon;
grant execute on function public.suivi_de_la_loge() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Et on déverse ce qui est déjà là
--    Le serveur d'essai porte les 467 tâches en brut depuis la reprise du
--    7 août. Le prochain déploiement rejoue les migrations : autant qu'elles
--    arrivent dans le journal sans qu'on ait à lancer quoi que ce soit.
--    Sans candidats en base — une base neuve, les tests — elle ne fait rien.
-- ---------------------------------------------------------------------------
do $$
declare
  bilan record;
begin
  select * into bilan from public.deverser_taches_bubble();
  if bilan.deversees > 0 then
    raise notice 'Tâches Bubble déversées dans le journal : % (dont % nouvelles)',
      bilan.deversees, bilan.creees;
    if bilan.sans_candidat > 0 then
      raise notice '  % laissées de côté — candidat absent de la base', bilan.sans_candidat;
    end if;
  end if;
end
$$;
