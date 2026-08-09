-- ---------------------------------------------------------------------------
-- 0036 — la réunion, et l'appel des référents
--
-- Ce que ça change : l'entrée « Réunion » du menu était éteinte. On peut
-- désormais ouvrir une réunion, appeler les référents de la loge un à un —
-- présent, excusé, absent — et compter les présences sur l'exercice.
--
-- CE QUE BUBBLE PORTAIT DÉJÀ
--
-- Le type `reunion` de Bubble est exactement ce dessin : une ligne datée, une
-- liste de présents (`referent`), une liste d'excusés (`EXCUSE`). Sept
-- réunions y dorment, de septembre à décembre 2025 — 82 présences, 18 excuses,
-- 19 référents. Elles sont reprises ici, comme les tâches l'ont été en 0023.
--
-- Le type n'est pas exposé par la base en service (HTTP 404 au 9 août 2026) :
-- il arrive par la base de l'éditeur, en réserve brute. Voir `MAJBUBBLE.md`.
--
-- DEUX TABLES, ET NON UNE
--
-- Vous aviez demandé « une table APPELS ». La réunion porte la date et le
-- lieu ; l'appel porte les personnes. Les séparer évite de répéter la date sur
-- chaque ligne — et permet d'ouvrir la réunion de jeudi avant d'y appeler
-- quiconque, ce qu'une table unique interdirait.
--
-- TROIS ÉTATS, ET NON DEUX
--
-- « Présent », « Excusé », « Absent » : les trois valeurs que porte déjà la
-- colonne `APPEL` des fiches Bubble. Sans « absent » explicite, on ne
-- distingue pas celui qui manquait de celui qu'on a oublié d'appeler, et
-- l'assiduité de l'exercice devient fausse.
--
-- QUI APPELLE
--
-- Toute la loge, comme pour le suivi depuis 0027. Une réunion n'appartient à
-- personne : celui qui tient le crayon ce soir-là n'est pas toujours le même.
--
-- SUPPRIMER, C'EST RETIRER
--
-- Même dessin qu'en 0025 : une réunion retirée quitte le registre, reste en
-- base, et se rend. Quinze lignes d'appel disparaissent d'un clic — c'est
-- exactement le geste qu'on veut pouvoir défaire.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La réunion
-- ---------------------------------------------------------------------------
create table if not exists public.reunion (
  id          uuid primary key default gen_random_uuid(),
  bubble_id   text unique,

  loge_id     uuid not null references public.loge (id) on delete cascade,
  -- Le jour de la réunion, et non celui de la saisie. Bubble n'avait que
  -- `Created Date` : une réunion notée le lendemain y portait la mauvaise
  -- date, et rien ne permettait de préparer celle de jeudi.
  tenue_le    date not null default current_date,
  lieu        text,

  ouverte_par uuid references public.referent (id) on delete set null,
  retire_le   timestamptz,
  retire_par  uuid references public.referent (id) on delete set null,

  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now()
);

comment on table public.reunion is
  'Une réunion de loge, datée. L''appel de ses référents est dans `appel`.';

comment on column public.reunion.tenue_le is
  'Le jour de la réunion, pas celui de la saisie — on note le lendemain la '
  'réunion de la veille, et l''on prépare celle de jeudi.';

-- Une loge ne tient pas deux réunions le même jour. La contrainte attrape le
-- double-clic et la saisie en double, qui fausseraient tous les compteurs.
create unique index if not exists reunion_loge_jour_idx
  on public.reunion (loge_id, tenue_le)
  where retire_le is null;

create index if not exists reunion_registre_idx
  on public.reunion (loge_id, tenue_le desc)
  where retire_le is null;

-- ---------------------------------------------------------------------------
-- 2. L'appel : une ligne par référent et par réunion
-- ---------------------------------------------------------------------------
create table if not exists public.appel (
  reunion_id  uuid not null references public.reunion (id) on delete cascade,
  referent_id uuid not null references public.referent (id) on delete cascade,
  etat        text not null check (etat in ('Présent', 'Excusé', 'Absent')),
  -- Qui a coché, et quand. L'appel se corrige à plusieurs mains.
  appele_par  uuid references public.referent (id) on delete set null,
  appele_le   timestamptz not null default now(),
  primary key (reunion_id, referent_id)
);

comment on table public.appel is
  'L''appel d''une réunion : un état par référent. Les trois valeurs sont '
  'celles de Bubble — Présent, Excusé, Absent.';

create index if not exists appel_referent_idx on public.appel (referent_id);

-- ---------------------------------------------------------------------------
-- 3. Fermées par défaut
--    Tout passe par des fonctions, comme le suivi : la RLS de `referent` et de
--    `loge` ne montre pas assez pour qu'une policy suffise.
-- ---------------------------------------------------------------------------
alter table public.reunion enable row level security;
alter table public.appel   enable row level security;

revoke all on public.reunion from public, anon, authenticated;
revoke all on public.appel   from public, anon, authenticated;
grant all on public.reunion to service_role;
grant all on public.appel   to service_role;

drop trigger if exists reunion_maj_le on public.reunion;
create trigger reunion_maj_le
  before update on public.reunion
  for each row execute function public.toucher_maj_le();

-- ---------------------------------------------------------------------------
-- 4. Ma loge — celle de ma fiche de référent
--    `loges_visibles()` en rendrait davantage : elle y ajoute les loges des
--    candidats qu'on accompagne, ce qui est juste pour ouvrir un dossier et
--    faux pour tenir un registre de réunions. Même raisonnement qu'en 0030.
-- ---------------------------------------------------------------------------
create or replace function public.ma_loge()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.loge_id from public.referent r
   where r.id = public.referent_courant()
$$;

comment on function public.ma_loge() is
  'La loge portée par ma fiche de référent. Null si je n''en ai pas — auquel '
  'cas je ne tiens aucun registre.';

revoke all on function public.ma_loge() from public, anon;
grant execute on function public.ma_loge() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ouvrir une réunion
-- ---------------------------------------------------------------------------
drop function if exists public.ouvrir_une_reunion(date, text);

create function public.ouvrir_une_reunion(jour date default current_date, ou text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  la_loge uuid := public.ma_loge();
  deja    uuid;
  neuve   uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Rouvrir plutôt que dédoubler : deux personnes qui ouvrent la réunion du
  -- même soir doivent tomber sur la même feuille.
  select id into deja from public.reunion
   where loge_id = la_loge and tenue_le = jour and retire_le is null;
  if deja is not null then
    return deja;
  end if;

  insert into public.reunion (loge_id, tenue_le, lieu, ouverte_par)
  values (la_loge, jour, nullif(btrim(ou), ''), moi)
  returning id into neuve;

  return neuve;
end
$$;

comment on function public.ouvrir_une_reunion(date, text) is
  'Ouvre la réunion du jour pour ma loge, ou rend celle qui existe déjà : '
  'deux personnes qui l''ouvrent en même temps tiennent la même feuille.';

revoke all on function public.ouvrir_une_reunion(date, text) from public, anon;
grant execute on function public.ouvrir_une_reunion(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cocher un référent
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_tenir_cette_reunion(reunion_choisie uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ma_loge() is not null and exists (
    select 1 from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.ma_loge() and r.retire_le is null
  )
$$;

revoke all on function public.puis_je_tenir_cette_reunion(uuid) from public, anon;

drop function if exists public.pointer_a_l_appel(uuid, uuid, text);

create function public.pointer_a_l_appel(reunion_choisie uuid, le_referent uuid, nouvel_etat text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi uuid := public.referent_courant();
begin
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
  'ne double pas. Ouvert à toute la loge, comme le suivi (0027).';

revoke all on function public.pointer_a_l_appel(uuid, uuid, text) from public, anon;
grant execute on function public.pointer_a_l_appel(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Retirer une réunion, et la rendre
-- ---------------------------------------------------------------------------
drop function if exists public.retirer_une_reunion(uuid);

create function public.retirer_une_reunion(reunion_choisie uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.reunion
     set retire_le = now(), retire_par = moi
   where id = reunion_choisie and loge_id = public.ma_loge() and retire_le is null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

comment on function public.retirer_une_reunion(uuid) is
  'Retire une réunion du registre sans l''effacer : ses lignes d''appel '
  'restent en base, et `rendre_une_reunion()` défait le geste.';

revoke all on function public.retirer_une_reunion(uuid) from public, anon;
grant execute on function public.retirer_une_reunion(uuid) to authenticated;

drop function if exists public.rendre_une_reunion(uuid);

create function public.rendre_une_reunion(reunion_choisie uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.reunion
     set retire_le = null, retire_par = null
   where id = reunion_choisie and loge_id = public.ma_loge() and retire_le is not null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

revoke all on function public.rendre_une_reunion(uuid) from public, anon;
grant execute on function public.rendre_une_reunion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. La feuille d'appel — ce que l'écran affiche
--    Tous les référents de la loge, leur état du jour, leur photo, et leur
--    assiduité sur l'exercice. Une seule fonction : l'écran ne fait qu'un
--    aller-retour.
-- ---------------------------------------------------------------------------
drop function if exists public.feuille_d_appel(uuid);

create function public.feuille_d_appel(reunion_choisie uuid)
returns table (
  referent_id       uuid,
  nom               text,
  prenom            text,
  college           text,
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo       boolean,
  /** Vide tant que personne ne l'a appelé — ce n'est pas « absent ». */
  etat              text,
  /** Ses présences et excuses sur l'exercice en cours. */
  presences         integer,
  excuses           integer
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
  la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.ma_loge()
  )
  select r.id, r.nom, r.prenom, r.college,
         (r.photo_chemin is not null or r.photo_url is not null),
         a.etat,
         (select count(*)::int from public.appel x
            join public.reunion u on u.id = x.reunion_id
            join bornes b on true
           where x.referent_id = r.id and x.etat = 'Présent'
             and u.retire_le is null
             and u.tenue_le between b.debut::date and b.fin::date),
         (select count(*)::int from public.appel x
            join public.reunion u on u.id = x.reunion_id
            join bornes b on true
           where x.referent_id = r.id and x.etat = 'Excusé'
             and u.retire_le is null
             and u.tenue_le between b.debut::date and b.fin::date)
    from public.referent r
    join la_reunion lr on r.loge_id = lr.loge_id
    left join public.appel a on a.reunion_id = lr.id and a.referent_id = r.id
   order by r.nom, r.prenom
$$;

comment on function public.feuille_d_appel(uuid) is
  'La feuille d''appel d''une réunion : les référents de la loge, leur état '
  'du jour, et leur assiduité sur l''exercice défini par `parametre`.';

revoke all on function public.feuille_d_appel(uuid) from public, anon;
grant execute on function public.feuille_d_appel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Le registre de l'exercice
-- ---------------------------------------------------------------------------
drop function if exists public.registre_des_reunions(boolean);

create function public.registre_des_reunions(avec_retirees boolean default false)
returns table (
  id            uuid,
  tenue_le      date,
  lieu          text,
  presents      integer,
  excuses       integer,
  absents       integer,
  effectif      integer,
  retiree       boolean,
  retire_par_nom text
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
     where loge_id = public.ma_loge()
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
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), '')
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.ma_loge()
     and u.tenue_le between b.debut::date and b.fin::date
     and (avec_retirees or u.retire_le is null)
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom
   order by u.tenue_le desc
$$;

comment on function public.registre_des_reunions(boolean) is
  'Les réunions de ma loge sur l''exercice en cours, avec leurs comptes. '
  'Les retirées n''y sont pas, sauf à les demander.';

revoke all on function public.registre_des_reunions(boolean) from public, anon;
grant execute on function public.registre_des_reunions(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Reprendre les sept réunions de Bubble
--     Même dessin qu'en 0023 pour les tâches : on lit `bubble_brut`, jamais le
--     réseau, et l'on se rejoue sans doubler.
--
--     Bubble n'a pas de date de réunion, seulement `Created Date`. On la prend
--     faute de mieux, ramenée au jour civil français — et c'est à signaler
--     dans le relevé de reprise.
-- ---------------------------------------------------------------------------
create or replace function public.deverser_reunions_bubble()
returns table (
  reunions      bigint,
  pointages     bigint,
  sans_loge     bigint,
  sans_referent bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  nb_reunions  bigint := 0;
  nb_pointages bigint := 0;
begin
  -- Les réunions. La loge est celle du référent qui l'a créée : Bubble ne la
  -- porte pas, et c'est le seul rattachement disponible.
  with brut as (
    select b.donnees as d from public.bubble_brut b
     where b.type_bubble = 'reunion' and b.donnees->>'_id' is not null
  ),
  posee as (
    insert into public.reunion (bubble_id, loge_id, tenue_le, ouverte_par, cree_le)
    select brut.d->>'_id',
           o.loge_id,
           ((brut.d->>'Created Date')::timestamptz at time zone 'Europe/Paris')::date,
           o.id,
           (brut.d->>'Created Date')::timestamptz
      from brut
      join public.referent o on o.bubble_id = nullif(btrim(brut.d->>'Created By'), '')
     where o.loge_id is not null
    on conflict (bubble_id) do update
      set tenue_le = excluded.tenue_le, loge_id = excluded.loge_id
    returning 1
  )
  select count(*) into nb_reunions from posee;

  -- Les pointages : la liste `referent` donne les présents, `EXCUSE` les
  -- excusés. Ce que Bubble ne dit pas, on ne l'invente pas — les absents ne
  -- sont pas écrits, ils se déduisent de l'effectif.
  with brut as (
    select b.donnees as d from public.bubble_brut b
     where b.type_bubble = 'reunion' and b.donnees->>'_id' is not null
  ),
  pointe as (
    select brut.d->>'_id' as reunion_bubble,
           jsonb_array_elements_text(coalesce(brut.d->'referent', '[]'::jsonb)) as ref,
           'Présent' as etat
      from brut
    union all
    select brut.d->>'_id',
           jsonb_array_elements_text(coalesce(brut.d->'EXCUSE', '[]'::jsonb)),
           'Excusé'
      from brut
  ),
  posee as (
    insert into public.appel (reunion_id, referent_id, etat, appele_le)
    select u.id, r.id, p.etat, u.cree_le
      from pointe p
      join public.reunion u on u.bubble_id = p.reunion_bubble
      join public.referent r on r.bubble_id = p.ref
    -- « Excusé » l'emporte si Bubble a mis quelqu'un dans les deux listes :
    -- une excuse est une information, une présence supposée n'en est pas une.
    on conflict (reunion_id, referent_id) do update
      set etat = case when excluded.etat = 'Excusé' then 'Excusé' else public.appel.etat end
    returning 1
  )
  select count(*) into nb_pointages from posee;

  return query
    select nb_reunions, nb_pointages,
      (select count(*) from public.bubble_brut b
        where b.type_bubble = 'reunion'
          and not exists (select 1 from public.referent o
                           where o.bubble_id = nullif(btrim(b.donnees->>'Created By'), '')
                             and o.loge_id is not null)),
      (select count(*) from (
         select jsonb_array_elements_text(coalesce(b.donnees->'referent', '[]'::jsonb)) as ref
           from public.bubble_brut b where b.type_bubble = 'reunion') x
        where not exists (select 1 from public.referent r where r.bubble_id = x.ref));
end
$$;

comment on function public.deverser_reunions_bubble() is
  'Déplie les réunions Bubble de `bubble_brut` vers `reunion` et `appel`. '
  'Rejouable ; ne lit pas le réseau.';

revoke all on function public.deverser_reunions_bubble() from public, anon, authenticated;
grant execute on function public.deverser_reunions_bubble() to service_role;

-- Et l'on déverse ce qui est déjà là, comme 0023 le fait pour les tâches.
do $$
declare
  bilan record;
begin
  select * into bilan from public.deverser_reunions_bubble();
  if bilan.reunions > 0 then
    raise notice 'Réunions Bubble reprises : % — % pointages', bilan.reunions, bilan.pointages;
  end if;
end
$$;
