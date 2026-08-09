-- ---------------------------------------------------------------------------
-- 0041 — effacer une réunion, pour de bon
--
-- Ce que ça change : jusqu'ici, « retirer n'est pas effacer » ne laissait
-- aucun moyen d'effacer. Une réunion ouverte par erreur — mauvaise date,
-- doublon, essai — restait en base à vie. Il en faut un.
--
-- L'effacement s'ajoute AU CÔTÉ du retrait, il ne le remplace pas. La
-- corbeille continue de retirer ; effacer est un second geste, plus rare et
-- sans retour. Une erreur de clic reste donc rattrapable.
--
-- TROIS BARRIÈRES
--
-- 1. **Pas les réunions venues de Bubble.** `deverser_reunions_bubble()` fait
--    un `on conflict (bubble_id) do update` : une réunion reprise de Bubble et
--    effacée reviendrait telle quelle à la prochaine reprise — au plus tard le
--    5 décembre 2026, jour de la bascule, quand plus personne ne saurait
--    pourquoi. Le retrait, lui, survit à la reprise (l'upsert ne touche pas à
--    `retire_le`). Donc : les réunions de Bubble se retirent, elles ne
--    s'effacent pas, et la fonction le dit au lieu de faire semblant.
--
-- 2. **Pas tout le monde.** Le pointage et le retrait sont ouverts à toute la
--    loge, parce qu'ils se défont. L'effacement ne se défait pas : il est
--    réservé à l'administrateur, au Vénérable Maître et au Secrétaire.
--
-- 3. **Sa loge, et rien d'autre** — comme partout ailleurs sur cet écran.
--
-- CE QUI PART AVEC ELLE
--
-- Les pointages. `appel.reunion_id` porte `on delete cascade` depuis 0036 :
-- effacer la réunion efface l'appel. C'est bien ce qu'on veut — un appel
-- orphelin ne voudrait rien dire — mais cela ne se rattrape pas, et l'écran
-- doit le chiffrer avant de le faire.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Quels titres donnent le droit d'effacer
--
-- Une table à part, et **pas une colonne sur `college`**. La tentation était
-- forte — les titres y sont déjà — mais 0017 est clair : cette liste-là « ne
-- fait que proposer », l'administration l'ajoute, la renomme et la supprime à
-- sa guise. Accrocher une autorisation à une liste de suggestions, c'est la
-- perdre en silence le jour où quelqu'un retire puis remet « Secrétaire » pour
-- corriger une faute de frappe.
--
-- Ici, le nom est stocké sous sa forme réduite : `referent.college` est du
-- texte libre, et la reprise Bubble a laissé « ␣vénérable maître␣ » à côté de
-- « Vénérable Maître ».
-- ---------------------------------------------------------------------------
create table if not exists public.titre_qui_efface (
  nom_reduit text primary key
);

comment on table public.titre_qui_efface is
  'Les titres du collège qui peuvent effacer une réunion, en forme réduite '
  '(minuscules, sans espaces de bord). Indépendant de la liste `college`, qui '
  'ne fait que proposer des libellés et que l''administration remanie.';

alter table public.titre_qui_efface enable row level security;

-- Aucune policy : la table ne se lit que par la fonction ci-dessous, qui est
-- `security definer`. Un droit ne se lit pas de l'extérieur.
revoke all on table public.titre_qui_efface from public, anon, authenticated;

insert into public.titre_qui_efface (nom_reduit) values
  ('vénérable maître'),
  ('vénérable'),
  ('secrétaire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Le droit, pour la session en cours
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_effacer_des_reunions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- `referent.college` est du texte libre (0017) : on compare sur la forme
  -- réduite, sans quoi « Secrétaire » et « secrétaire  » seraient deux titres.
  select public.est_admin() or exists (
    select 1
      from public.referent r
      join public.titre_qui_efface t
        on t.nom_reduit = lower(btrim(r.college))
     where r.id = public.referent_courant()
  )
$$;

comment on function public.puis_je_effacer_des_reunions() is
  'Vrai si la session peut effacer une réunion : administrateur, ou titre du '
  'collège marqué peut_effacer. L''écran s''en sert pour montrer le geste.';

revoke all on function public.puis_je_effacer_des_reunions() from public, anon;
grant execute on function public.puis_je_effacer_des_reunions() to authenticated;

-- ---------------------------------------------------------------------------
-- Le geste
--
-- Rend un mot plutôt qu'un booléen : trois refus différents méritent trois
-- phrases différentes, et « faux » ne dit pas laquelle.
--
--   'effacee'     — c'est fait, elle et ses pointages ont quitté la base
--   'introuvable' — pas de cette loge, ou déjà effacée
--   'bubble'      — reprise de Bubble : elle reviendrait, donc on refuse
--
-- Le manque de droit, lui, lève : ce n'est pas un cas de figure, c'est une
-- porte fermée.
-- ---------------------------------------------------------------------------
drop function if exists public.effacer_une_reunion(uuid);

create function public.effacer_une_reunion(reunion_choisie uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_de_bubble boolean;
begin
  if not public.puis_je_effacer_des_reunions() then
    raise exception 'Ce compte ne peut pas effacer de réunion'
      using errcode = 'insufficient_privilege';
  end if;

  select u.bubble_id is not null into venue_de_bubble
    from public.reunion u
   where u.id = reunion_choisie
     and u.loge_id = public.ma_loge();

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

comment on function public.effacer_une_reunion(uuid) is
  'Efface une réunion et ses pointages, sans retour. Refuse celles reprises '
  'de Bubble : la prochaine reprise les recréerait.';

revoke all on function public.effacer_une_reunion(uuid) from public, anon;
grant execute on function public.effacer_une_reunion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Le registre dit d'où vient chaque réunion
--
-- Sans quoi l'écran proposerait d'effacer une réunion de Bubble, et la base
-- refuserait après coup. Un bouton qui échoue toujours vaut moins qu'un bouton
-- qui n'est pas là.
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
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.bubble_id is not null
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.ma_loge()
     and u.tenue_le between b.debut::date and b.fin::date
     and (avec_retirees or u.retire_le is null)
   group by u.id, u.tenue_le, u.lieu, u.retire_le, u.bubble_id, e.n, q.prenom, q.nom
   order by u.tenue_le desc
$$;

comment on function public.registre_des_reunions(boolean) is
  'Les réunions de ma loge sur l''exercice en cours, avec leurs comptes. '
  'Les retirées n''y sont pas, sauf à les demander.';

revoke all on function public.registre_des_reunions(boolean) from public, anon;
grant execute on function public.registre_des_reunions(boolean) to authenticated;
