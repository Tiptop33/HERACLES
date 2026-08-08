-- ---------------------------------------------------------------------------
-- 0024 — écrire une tâche, et la refermer
--
-- Ce que ça change : le journal savait recevoir des notes — ce qui a eu lieu,
-- daté (0021). Il ne savait pas recevoir ce qui reste à faire. Les 438 tâches
-- ouvertes reprises de Bubble (0023) étaient donc en lecture seule : on les
-- voyait, on ne pouvait ni en ajouter, ni en refermer une.
--
-- Désormais : une note peut naître avec un état, et l'état d'une ligne se
-- change. Le texte, lui, ne bouge pas d'ici — il reste soumis à la règle de
-- 0021, corrigible par son seul auteur.
--
-- QUI REFERME — un écart assumé avec 0021
--
-- 0021 tenait une ligne nette : la loge **lit**, le référent et le parrain
-- **écrivent**. Refermer une tâche est ici ouvert à toute la loge, c'est-à-dire
-- à quiconque a le droit de voir la fiche. C'est une décision prise le 8 août
-- 2026, en connaissance de la ligne qu'elle déplace, et pour une raison que
-- les données imposent : sur les 467 tâches reprises, **73 n'ont aucun auteur**
-- et les autres sont signées par des référents Bubble qui n'ont pas forcément
-- de compte. Réservée à l'auteur, la fermeture n'aurait jamais pu servir — les
-- 438 tâches ouvertes le seraient restées pour toujours.
--
-- Ce que cet écart coûte, et comment on le paie : on ne sait plus d'avance qui
-- a refermé quoi. D'où `etat_par` et `etat_le`. Une action ouverte à plusieurs
-- sans trace de son auteur, c'est exactement ce que 0021 refusait ; la trace
-- rend l'ouverture tenable au lieu de la rendre floue.
--
-- POURQUOI UNE FONCTION ET NON UNE POLICY D'UPDATE PLUS LARGE
--
-- PostgreSQL n'applique pas la RLS colonne par colonne. Une policy `update`
-- ouverte à la loge ouvrirait aussi le **texte** — donc la réécriture du mot
-- d'un collègue, que 0021 interdit explicitement. La fonction, elle, ne touche
-- qu'`etat` : c'est le seul dessin qui élargit une chose sans en élargir une
-- autre.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Qui a refermé, et quand
-- ---------------------------------------------------------------------------
alter table public.suivi
  add column if not exists etat_par uuid references public.referent (id) on delete set null;
alter table public.suivi
  add column if not exists etat_le timestamptz;

comment on column public.suivi.etat_par is
  'Qui a changé l''état en dernier. Vide pour les tâches reprises de Bubble, '
  'dont l''état n''a jamais été touché depuis HERACLES.';

-- Un état est un mot, pas un paragraphe. La contrainte se pose une fois — un
-- `add constraint` ne connaît pas `if not exists`, d'où le détour.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'suivi_etat_court'
  ) then
    alter table public.suivi add constraint suivi_etat_court
      check (etat is null or length(btrim(etat)) between 1 and 120);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Changer l'état d'une ligne
--    La règle de lecture de 0021, et rien de plus : qui a le droit de voir la
--    fiche a le droit de refermer ses tâches.
-- ---------------------------------------------------------------------------
drop function if exists public.changer_etat_du_suivi(uuid, text);

create function public.changer_etat_du_suivi(ligne uuid, nouvel_etat text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  propre  text := nullif(btrim(nouvel_etat), '');
  touchee int;
begin
  if propre is null or length(propre) > 120 then
    raise exception 'État invalide' using errcode = 'check_violation';
  end if;

  -- Sans fiche de référent, on n'agit pas : l'administration lit, elle
  -- n'accompagne pas. Même refus qu'à l'écriture d'une note (0021).
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.suivi s
     set etat = propre, etat_par = moi, etat_le = now()
    from public.candidat c
   where s.id = ligne
     and c.id = s.candidat_id
     and (c.referent_id = moi
       or c.parrain_id  = moi
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())));

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

comment on function public.changer_etat_du_suivi(uuid, text) is
  'Change l''état d''une ligne de suivi — et lui seul. Ouvert à toute la loge, '
  'contrairement à la correction du texte : voir l''en-tête de 0024. Rend faux '
  'quand la ligne n''existe pas ou qu''on n''a pas le droit de la voir.';

-- L'administration n'y a pas accès : elle n'a pas de fiche de référent, et la
-- fonction la refuse d'elle-même. Le `grant` va aux sessions connectées.
revoke all on function public.changer_etat_du_suivi(uuid, text) from public, anon;
grant execute on function public.changer_etat_du_suivi(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Les deux lectures rendent qui a refermé
--    Troisième version de ces fonctions (0021, 0023, celle-ci) : elles sont
--    redéfinies en entier, faute de pouvoir ajouter une colonne à un type de
--    retour existant.
-- ---------------------------------------------------------------------------
drop function if exists public.suivi_du_candidat(uuid);

create function public.suivi_du_candidat(candidat uuid)
returns table (
  id            uuid,
  fait_le       date,
  nature        text,
  etat          text,
  texte         text,
  auteur_nom    text,
  /** Qui a changé l'état en dernier, quand ce n'est pas resté celui de Bubble. */
  etat_par_nom  text,
  /** Le mien : l'écran ne propose de corriger que ce qu'on a écrit. */
  c_est_moi     boolean,
  /**
   * Puis-je refermer ? Vrai dès qu'une fiche de référent est rattachée au
   * compte — la lecture, elle, suffit déjà à porter le droit (voir 0024).
   * Faux pour une administratrice sans fiche : elle lit, elle n'agit pas.
   * La base refuserait de toute façon ; cette colonne évite d'afficher un
   * bouton qui mène à un mur.
   */
  je_peux_agir  boolean,
  cree_le       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(e.prenom, '') || ' ' || coalesce(e.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         public.referent_courant() is not null,
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent e on e.id = s.etat_par
   where s.candidat_id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_du_candidat(uuid) is
  'Le journal d''un candidat, du plus récent au plus ancien, pour qui a le '
  'droit de voir sa fiche (même règle que 0020). Écrire une note passe par la '
  'table, donc par la RLS : le référent et le parrain seulement. Changer un '
  'état passe par changer_etat_du_suivi(), ouvert à la loge.';

revoke all on function public.suivi_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_du_candidat(uuid) to authenticated;

drop function if exists public.suivi_de_la_loge();

create function public.suivi_de_la_loge()
returns table (
  candidat_id   uuid,
  id            uuid,
  fait_le       date,
  nature        text,
  etat          text,
  texte         text,
  auteur_nom    text,
  etat_par_nom  text,
  c_est_moi     boolean,
  je_peux_agir  boolean,
  cree_le       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.candidat_id, s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(e.prenom, '') || ' ' || coalesce(e.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         public.referent_courant() is not null,
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent e on e.id = s.etat_par
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
