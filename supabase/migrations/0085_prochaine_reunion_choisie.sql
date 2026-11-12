-- ---------------------------------------------------------------------------
-- 0085 — la date de la prochaine réunion se dit sur la feuille d'appel
--
-- Ce que ça change : avant de tirer le compte rendu, la commission indique la
-- date de sa prochaine réunion. La feuille d'appel la propose — le 2e ou le
-- 4e mercredi suivant, reporté au lendemain s'il tombe un jour férié
-- (`calendrier.ts`) — et on la corrige si la salle manque ou si l'on décide
-- autrement en séance. Le compte rendu imprime la date retenue.
--
-- CE QUI EST IMPRIMÉ, DANS CET ORDRE
--
--   1. la date retenue sur la feuille (`reunion.prochaine_le`) ;
--   2. à défaut, la réunion suivante déjà inscrite au registre (0067) ;
--   3. à défaut, la date calculée par le calendrier, côté application.
--
-- Effacer le champ revient au calcul : rien n'est figé tant qu'on n'a rien
-- saisi, et la date proposée suit les réglages de Paramètres › Mise en page.
--
-- QUI LA DIT
--
-- Toute la loge, comme pour l'appel et l'affichette (0068) : c'est une
-- décision de séance. La table reste fermée (0036) ; tout passe par
-- `choisir_la_prochaine_reunion()`, qui tient la porte de `ma_loge()`.
--
-- Une date qui ne vient pas après la réunion est refusée : on n'annonce pas
-- une réunion passée.
-- ---------------------------------------------------------------------------

alter table public.reunion
  add column if not exists prochaine_le date;

comment on column public.reunion.prochaine_le is
  'La date de la prochaine réunion, dite sur la feuille d''appel et imprimée '
  'sur le compte rendu. Vide : la date se calcule (2e et 4e mercredis).';

-- ---------------------------------------------------------------------------
-- Dire la date
--
-- Rend `ok`, ou la raison du refus — `reunion` (pas de ma loge, ou retirée),
-- `date` (pas après la réunion). `null` efface : la date se recalcule.
-- ---------------------------------------------------------------------------
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
  if public.referent_courant() is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select r.tenue_le into le_jour
    from public.reunion r
   where r.id = reunion_choisie
     and r.loge_id = public.ma_loge()
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

comment on function public.choisir_la_prochaine_reunion(uuid, date) is
  'Retient la date de la prochaine réunion pour le compte rendu de cette '
  'réunion de ma loge, ou l''efface (null). Rend ok, reunion ou date.';

revoke all on function public.choisir_la_prochaine_reunion(uuid, date) from public, anon;
grant execute on function public.choisir_la_prochaine_reunion(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Ce qu'imprime le compte rendu — la forme de 0067, la date retenue d'abord
--
-- Même type de retour : `create or replace` suffit, et se rejoue après 0067,
-- qui recrée l'ancienne forme à chaque déploiement.
-- ---------------------------------------------------------------------------
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
     where r.id = reunion_choisie and r.loge_id = public.ma_loge()
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

comment on function public.commission_de_la_reunion(uuid) is
  'La commission d''une réunion de ma loge : son nom, son lieu, son vénérable '
  'et son secrétaire, le nombre de dossiers traités et la prochaine réunion — '
  'celle dite sur la feuille (0085), sinon celle inscrite au registre. Rien '
  'hors de ma loge.';

revoke all on function public.commission_de_la_reunion(uuid) from public, anon;
grant execute on function public.commission_de_la_reunion(uuid) to authenticated;
