-- ---------------------------------------------------------------------------
-- 0116 — la réunion, réservée à l'administration
--
-- Ce que ça change : l'entrée « Réunion » quitte la famille « Réseau » pour
-- la famille « Admin », que les référents ne voient pas (décision du
-- 27 novembre 2026). Ouvrir l'appel, pointer, clore la feuille, retirer,
-- rendre ou effacer une réunion, choisir l'affichette ou la prochaine date,
-- lire le registre, la feuille et les données du compte rendu, de l'affiche
-- et de l'affichette : tout cela n'appartient plus qu'aux administrateurs.
--
-- POURQUOI DANS LA BASE, ET PAS SEULEMENT DANS LE MENU
--
-- Retirer l'entrée du menu ne ferme rien : les fonctions restent appelables
-- par tout compte connecté, avec la clé publique de l'API. La RLS est le
-- contrôle d'accès, pas un filtre écrit dans une page (CLAUDE.md) — et un
-- droit ne doit jamais être plus large que l'écran qui le justifie.
--
-- UNE SEULE RÈGLE, À UN SEUL ENDROIT
--
-- Toutes les fonctions de la réunion trouvaient leur loge par `ma_loge()`
-- (0036). Elles la trouvent désormais par `loge_des_reunions()`, qui rend la
-- même loge à un administrateur, et aucune à quiconque d'autre :
--
--   · les lectures rendent alors une liste vide — rien ne fuit ;
--   · les écritures, elles, lèvent `insufficient_privilege` avant tout : le
--     manque de droit n'est pas un cas de figure, c'est une porte fermée
--     (même principe qu'en 0041).
--
-- `ma_loge()` ne change pas : vingt autres fonctions s'en servent (candidats,
-- documents, secrétaire de la loge…), et les référents en ont besoin.
--
-- CE QUI NE CHANGE PAS
--
--   · Chaque administrateur ne tient que les réunions de **sa** loge — celle
--     de sa fiche de référent. Un administrateur sans fiche ni loge reçoit
--     toujours « aucune loge » : sa loge se règle dans Admin › Comptes (0109).
--   · Les PDF déjà rangés restent dans « Documents », visibles de la loge
--     (0069) : c'est la fabrication qui se ferme, pas l'archive.
--   · `puis_je_effacer_des_reunions()` reste telle qu'en 0041 : elle sert
--     aussi aux documents (0069). Pour une réunion, l'effacement exige
--     désormais d'être administrateur, ce qui l'implique.
--
-- Rejouable : `create or replace`, mêmes signatures et mêmes types de retour
-- que les versions remplacées. Le serveur rejoue toutes les migrations à
-- chaque déploiement ; celle-ci, venant après, remet chaque fois la garde.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La règle : la loge dont la session tient les réunions
-- ---------------------------------------------------------------------------
create or replace function public.loge_des_reunions()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.est_admin() then public.ma_loge() end
$$;

comment on function public.loge_des_reunions() is
  'La loge dont la session tient les réunions : celle de sa fiche de référent '
  'si elle administre, aucune sinon (0116). Toutes les fonctions de la réunion '
  'passent par elle.';

revoke all on function public.loge_des_reunions() from public, anon;
grant execute on function public.loge_des_reunions() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La porte des pointages (0036)
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_tenir_cette_reunion(reunion_choisie uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.loge_des_reunions() is not null and exists (
    select 1 from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.loge_des_reunions() and r.retire_le is null
  )
$$;

revoke all on function public.puis_je_tenir_cette_reunion(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Ouvrir une réunion (0054)
-- ---------------------------------------------------------------------------
create or replace function public.ouvrir_une_reunion(jour date default current_date,
                                                     ou text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  moi         uuid := public.referent_courant();
  la_loge     uuid := public.loge_des_reunions();
  la_reunion  uuid;
begin
  -- ouvrir_une_reunion — version 0116
  -- (ce repère sert au garde-fou du test de 0046 : voir ce fichier de test.)
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Rouvrir plutôt que dédoubler : deux personnes qui ouvrent la réunion du
  -- même soir doivent tomber sur la même feuille. Celle d'ici d'abord, la plus
  -- ancienne ensuite (0046).
  select id into la_reunion from public.reunion
   where loge_id = la_loge and tenue_le = jour and retire_le is null
   order by (bubble_id is null) desc, cree_le
   limit 1;

  if la_reunion is null then
    insert into public.reunion (loge_id, tenue_le, lieu, ouverte_par)
    values (la_loge, jour, nullif(btrim(ou), ''), moi)
    returning id into la_reunion;
  end if;

  -- Les autres : ceux dont la session est ouverte (0053, qui délègue à 0052).
  perform public.pointer_les_connectes(la_reunion);

  -- Et moi. `les_connectes()` ne me rendra jamais — voir l'en-tête de 0054.
  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  values (la_reunion, moi, 'Présent', moi, now())
  on conflict (reunion_id, referent_id) do nothing;

  return la_reunion;
end
$$;

comment on function public.ouvrir_une_reunion(date, text) is
  'Ouvre la réunion du jour pour ma loge, ou rend celle qui existe déjà : '
  'deux personnes qui l''ouvrent en même temps tiennent la même feuille. '
  'Réservée à l''administration (0116).';

-- ---------------------------------------------------------------------------
-- 4. Pointer un référent (0036)
-- ---------------------------------------------------------------------------
create or replace function public.pointer_a_l_appel(reunion_choisie uuid, le_referent uuid, nouvel_etat text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi uuid := public.referent_courant();
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if nouvel_etat not in ('Présent', 'Excusé', 'Absent') then
    raise exception 'État d''appel inconnu' using errcode = 'check_violation';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.puis_je_tenir_cette_reunion(reunion_choisie) then
    return false;
  end if;

  -- Le référent doit être de la loge de la réunion : on n'appelle pas
  -- quelqu'un qui n'y siège pas.
  if not exists (
    select 1 from public.referent r
     join public.reunion u on u.id = reunion_choisie
    where r.id = le_referent and r.loge_id = u.loge_id
  ) then
    return false;
  end if;

  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  values (reunion_choisie, le_referent, nouvel_etat, moi, now())
  on conflict (reunion_id, referent_id) do update
    set etat = excluded.etat, appele_par = excluded.appele_par, appele_le = excluded.appele_le;

  return true;
end
$$;

comment on function public.pointer_a_l_appel(uuid, uuid, text) is
  'Pose l''état d''un référent pour une réunion. Rejouable : recocher écrase, '
  'ne double pas. Réservée à l''administration (0116).';

-- ---------------------------------------------------------------------------
-- 5. Pointer d'un coup ceux qui sont en ligne (0052)
-- ---------------------------------------------------------------------------
create or replace function public.pointer_les_connectes(reunion_choisie uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moi   uuid := public.referent_courant();
  poses integer;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Même porte que le pointage un à un : la loge de la réunion, et rien
  -- d'autre. `null` dit « pas cette réunion-là », comme pour la clôture.
  if not public.puis_je_tenir_cette_reunion(reunion_choisie) then
    return null;
  end if;

  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  select reunion_choisie, c.referent_id, 'Présent', moi, now()
    from public.les_connectes() c
  on conflict (reunion_id, referent_id) do nothing;

  get diagnostics poses = row_count;
  return poses;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Clore la feuille (0039)
-- ---------------------------------------------------------------------------
create or replace function public.clore_la_feuille(reunion_choisie uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  poses   integer;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Même porte que le pointage : la loge de la réunion, et rien d'autre.
  if not public.puis_je_tenir_cette_reunion(reunion_choisie) then
    return null;
  end if;

  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  select u.id, r.id, 'Absent', moi, now()
    from public.reunion u
    join public.referent r on r.loge_id = u.loge_id
   where u.id = reunion_choisie
  on conflict (reunion_id, referent_id) do nothing;

  get diagnostics poses = row_count;
  return poses;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Retirer une réunion, et la rendre (0036)
-- ---------------------------------------------------------------------------
create or replace function public.retirer_une_reunion(reunion_choisie uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.reunion
     set retire_le = now(), retire_par = moi
   where id = reunion_choisie and loge_id = public.loge_des_reunions() and retire_le is null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

create or replace function public.rendre_une_reunion(reunion_choisie uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.reunion
     set retire_le = null, retire_par = null
   where id = reunion_choisie and loge_id = public.loge_des_reunions() and retire_le is not null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Effacer une réunion (0041)
--    Le titre du collège ne suffit plus : il faut administrer. Un Secrétaire
--    qui n'est pas administrateur n'atteint plus l'écran, il n'efface plus.
-- ---------------------------------------------------------------------------
create or replace function public.effacer_une_reunion(reunion_choisie uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_de_bubble boolean;
begin
  if not public.est_admin() then
    raise exception 'Ce compte ne peut pas effacer de réunion'
      using errcode = 'insufficient_privilege';
  end if;

  select u.bubble_id is not null into venue_de_bubble
    from public.reunion u
   where u.id = reunion_choisie
     and u.loge_id = public.loge_des_reunions();

  -- De l'extérieur, une réunion d'une autre loge et une réunion absente se
  -- ressemblent : c'est voulu.
  if venue_de_bubble is null then
    return 'introuvable';
  end if;

  if venue_de_bubble then
    return 'bubble';
  end if;

  -- Les pointages suivent, par la cascade posée en 0036.
  delete from public.reunion where id = reunion_choisie;
  return 'effacee';
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Choisir l'affichette (0068), et la prochaine réunion (0085)
-- ---------------------------------------------------------------------------
create or replace function public.choisir_l_affichette(reunion_choisie uuid, candidat_choisi uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  la_loge uuid;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if public.referent_courant() is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select r.loge_id into la_loge
    from public.reunion r
   where r.id = reunion_choisie
     and r.loge_id = public.loge_des_reunions()
     and r.retire_le is null;
  if la_loge is null then
    return 'reunion';
  end if;

  if candidat_choisi is not null and not exists (
    select 1 from public.candidat c
     where c.id = candidat_choisi
       and c.loge_id = la_loge
       and public.mot_de_fermeture(c.cloture) is null
       and public.mot_de_fermeture(c.archive) is null
  ) then
    return 'candidat';
  end if;

  update public.reunion
     set affichette_candidat_id = candidat_choisi
   where id = reunion_choisie;
  return 'ok';
end;
$$;

create or replace function public.choisir_la_prochaine_reunion(reunion_choisie uuid, date_choisie date)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  le_jour date;
begin
  if not public.est_admin() then
    raise exception 'La réunion est réservée à l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if public.referent_courant() is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select r.tenue_le into le_jour
    from public.reunion r
   where r.id = reunion_choisie
     and r.loge_id = public.loge_des_reunions()
     and r.retire_le is null;
  if le_jour is null then
    return 'reunion';
  end if;

  if date_choisie is not null and date_choisie <= le_jour then
    return 'date';
  end if;

  update public.reunion
     set prochaine_le = date_choisie
   where id = reunion_choisie;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Les registres (0041, 0040, 0038) et la réunion ouverte (0037)
--     Mêmes corps : `ma_loge()` devient `loge_des_reunions()`. Pour un
--     référent, la liste est vide.
-- ---------------------------------------------------------------------------
create or replace function public.registre_des_reunions(avec_retirees boolean default false)
returns table (
  id            uuid,
  tenue_le      date,
  lieu          text,
  presents      integer,
  excuses       integer,
  absents       integer,
  effectif      integer,
  retiree       boolean,
  retire_par_nom text,
  /** Reprise de Bubble : elle se retire, elle ne s'efface pas. */
  venue_de_bubble boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  effectif as (
    select count(*)::int as n from public.referent
     where loge_id = public.loge_des_reunions()
  )
  select u.id, u.tenue_le, u.lieu,
         count(*) filter (where a.etat = 'Présent')::int,
         count(*) filter (where a.etat = 'Excusé')::int,
         -- Absent = l'effectif moins ceux qu'on a cochés autrement. Celui
         -- qu'on a oublié d'appeler compte donc comme absent au registre,
         -- alors que la feuille le laisse vide : le registre décrit la
         -- réunion, la feuille décrit le travail en cours.
         greatest(e.n - count(*) filter (where a.etat in ('Présent', 'Excusé')), 0)::int,
         e.n,
         u.retire_le is not null,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.bubble_id is not null
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.loge_des_reunions()
     and u.tenue_le between b.debut::date and b.fin::date
     and (avec_retirees or u.retire_le is null)
   group by u.id, u.tenue_le, u.lieu, u.retire_le, u.bubble_id, e.n, q.prenom, q.nom
   order by u.tenue_le desc
$$;

create or replace function public.registre_des_retirees()
returns table (
  id             uuid,
  tenue_le       date,
  lieu           text,
  presents       integer,
  excuses        integer,
  absents        integer,
  effectif       integer,
  retiree        boolean,
  retire_par_nom text,
  /**
   * Le jour du retrait, **en heure de Paris**.
   *
   * Converti ici et non à l'affichage : `retire_le` est un horodatage UTC, et
   * un retrait fait après 22 h à Paris se lirait la veille si l'on se
   * contentait de couper la chaîne. L'ordre, lui, suit l'horodatage entier.
   */
  retire_le      date,
  /** Hors des bornes de l'exercice : rendue, elle ne compterait toujours pas. */
  hors_exercice  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  effectif as (
    select count(*)::int as n from public.referent
     where loge_id = public.loge_des_reunions()
  )
  select u.id, u.tenue_le, u.lieu,
         count(*) filter (where a.etat = 'Présent')::int,
         count(*) filter (where a.etat = 'Excusé')::int,
         greatest(e.n - count(*) filter (where a.etat in ('Présent', 'Excusé')), 0)::int,
         e.n,
         true,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         (u.retire_le at time zone 'Europe/Paris')::date,
         u.tenue_le not between b.debut::date and b.fin::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.loge_des_reunions()
     and u.retire_le is not null
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut, b.fin
   -- La dernière retirée en tête : on cherche presque toujours celle qu'on
   -- vient de retirer par erreur.
   order by u.retire_le desc, u.tenue_le desc
$$;

create or replace function public.registre_hors_exercice()
returns table (
  id             uuid,
  tenue_le       date,
  lieu           text,
  presents       integer,
  excuses        integer,
  absents        integer,
  effectif       integer,
  retiree        boolean,
  retire_par_nom text,
  /**
   * Avant le début de l'exercice — donc un exercice précédent. Faux pour une
   * réunion tenue après la clôture, qui est le cas le plus fréquent tant que
   * les dates n'ont pas été remises à jour.
   */
  avant          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  effectif as (
    select count(*)::int as n from public.referent
     where loge_id = public.loge_des_reunions()
  )
  select u.id, u.tenue_le, u.lieu,
         count(*) filter (where a.etat = 'Présent')::int,
         count(*) filter (where a.etat = 'Excusé')::int,
         greatest(e.n - count(*) filter (where a.etat in ('Présent', 'Excusé')), 0)::int,
         e.n,
         u.retire_le is not null,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.tenue_le < b.debut::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.loge_des_reunions()
     and u.retire_le is null
     and u.tenue_le not between b.debut::date and b.fin::date
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut
   order by u.tenue_le desc
$$;

create or replace function public.la_reunion(reunion_choisie uuid)
returns table (
  id             uuid,
  tenue_le       date,
  lieu           text,
  presents       integer,
  excuses        integer,
  absents        integer,
  effectif       integer,
  retiree        boolean,
  retire_par_nom text,
  /** Hors des bornes de l'exercice : elle ne compte dans aucun total. */
  hors_exercice  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  effectif as (
    select count(*)::int as n from public.referent
     where loge_id = public.loge_des_reunions()
  )
  select u.id, u.tenue_le, u.lieu,
         count(*) filter (where a.etat = 'Présent')::int,
         count(*) filter (where a.etat = 'Excusé')::int,
         greatest(e.n - count(*) filter (where a.etat in ('Présent', 'Excusé')), 0)::int,
         e.n,
         u.retire_le is not null,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.tenue_le not between b.debut::date and b.fin::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.id = reunion_choisie
     and u.loge_id = public.loge_des_reunions()
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut, b.fin
$$;

-- ---------------------------------------------------------------------------
-- 11. La feuille d'appel (0045), et le dossier de l'affichette (0068)
-- ---------------------------------------------------------------------------
create or replace function public.feuille_d_appel(reunion_choisie uuid)
returns table (
  referent_id       uuid,
  nom               text,
  prenom            text,
  college           text,
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo       boolean,
  /** Vide tant que personne ne l'a appelé — ce n'est pas « absent ». */
  etat              text,
  /** Sur **cette réunion** seulement : 1 ou 0. */
  presences         integer,
  excuses           integer
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.loge_des_reunions()
  )
  select r.id, r.nom, r.prenom, r.college,
         (r.photo_chemin is not null or r.photo_url is not null),
         a.etat,
         case when a.etat = 'Présent' then 1 else 0 end,
         case when a.etat = 'Excusé'  then 1 else 0 end
    from public.referent r
    join la_reunion lr on r.loge_id = lr.loge_id
    left join public.appel a on a.reunion_id = lr.id and a.referent_id = r.id
   order by r.nom, r.prenom
$$;

create or replace function public.affichette_de_la_reunion(reunion_choisie uuid)
returns table (candidat_id uuid, numero integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero
    from public.reunion r
    join public.candidat c on c.id = r.affichette_candidat_id
   where r.id = reunion_choisie
     and r.loge_id = public.loge_des_reunions()
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

-- ---------------------------------------------------------------------------
-- 12. Les données des trois documents : compte rendu (0055), commission
--     (0085), dossiers en cours (0073)
-- ---------------------------------------------------------------------------
create or replace function public.compte_rendu_presences(reunion_choisie uuid)
returns table (
  referent_id uuid,
  nom         text,
  prenom      text,
  email       text,
  telephone   text,
  /** L'état du jour : Présent, Excusé, Absent — ou null, jamais appelé. */
  etat        text,
  /** Réunions de l'exercice où cette personne était présente. */
  presences   integer,
  /** Ce que cela fait en pourcentage des réunions de l'exercice. */
  taux        integer
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.loge_des_reunions()
  ),
  bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  -- Les réunions de l'exercice, pour la loge de celle qu'on imprime.
  tenues as (
    select u.id
      from public.reunion u
      join la_reunion lr on u.loge_id = lr.loge_id
      join bornes b on true
     where u.retire_le is null
       and u.tenue_le between b.debut and b.fin
  ),
  combien as (select count(*)::int as n from tenues)
  select r.id, r.nom, r.prenom, r.email, r.telephone,
         a.etat,
         venues.n,
         -- Zéro réunion à l'exercice : zéro pour tout le monde, et pas une
         -- division par zéro.
         case when combien.n = 0 then 0
              else round(100.0 * venues.n / combien.n)::int
         end
    from public.referent r
    join la_reunion lr on r.loge_id = lr.loge_id
    join combien on true
    left join public.appel a on a.reunion_id = lr.id and a.referent_id = r.id
    cross join lateral (
      select count(*)::int as n
        from public.appel p
        join tenues t on t.id = p.reunion_id
       where p.referent_id = r.id and p.etat = 'Présent'
    ) as venues
   order by r.nom, r.prenom
$$;

create or replace function public.commission_de_la_reunion(reunion_choisie uuid)
returns table (
  loge_nom             text,
  lieu_reunions        text,
  nombre_dossiers      integer,
  prochaine_reunion    date,
  venerable_prenom     text,
  venerable_nom        text,
  venerable_telephone  text,
  venerable_email      text,
  secretaire_prenom    text,
  secretaire_nom       text,
  secretaire_telephone text,
  secretaire_email     text
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.loge_des_reunions()
  )
  select l.nom, l.lieu_reunions,
         (select max(c.numero) from public.candidat c where c.loge_id = lr.loge_id),
         coalesce(
           lr.prochaine_le,
           (select min(u.tenue_le) from public.reunion u
             where u.loge_id = lr.loge_id
               and u.retire_le is null
               and u.tenue_le > lr.tenue_le)),
         v.prenom, v.nom, v.telephone, v.email,
         s.prenom, s.nom, s.telephone, s.email
    from la_reunion lr
    join public.loge l on l.id = lr.loge_id
    left join lateral public.officier_de_la_loge(lr.loge_id, array['vénérable maître', 'vénérable']) v on true
    left join lateral public.officier_de_la_loge(lr.loge_id, array['secrétaire']) s on true
$$;

create or replace function public.dossiers_en_cours(reunion_choisie uuid)
returns table (
  candidat_id       uuid,
  numero            integer,
  ouvert_le         date,
  emploi            text,
  recherche         text,
  nom               text,
  prenom            text,
  referent_nom      text,
  commentaire       text,
  a_un_cv           boolean,
  definition_emploi text,
  metier_libelle    text,
  type_emploi       text,
  cv_anonyme_jeton  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.loge_des_reunions()
  )
  select c.id, c.numero, c.cree_le::date,
         coalesce(nullif(btrim(c.metier_libelle), ''), c.emploi_recherche),
         c.emploi_recherche,
         c.nom, c.prenom,
         r.nom,
         dernier.texte,
         (c.cv_chemin is not null or c.cv_url is not null),
         c.definition_emploi,
         c.metier_libelle,
         c.type_emploi,
         case when c.cv_anonyme_chemin is not null or c.cv_anonyme_valide_le is not null
              then c.cv_anonyme_jeton end
    from public.candidat c
    join la_reunion lr on c.loge_id = lr.loge_id
    left join public.referent r on r.id = c.referent_id
    left join lateral (
      select s.texte
        from public.suivi s
       where s.candidat_id = c.id and s.retire_le is null
       order by s.fait_le desc nulls last, s.cree_le desc
       limit 1
    ) as dernier on true
   where public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
   order by c.numero asc nulls last, c.nom, c.prenom
$$;
