-- ---------------------------------------------------------------------------
-- 0046 — l'histoire reprise de Bubble a le droit d'être imparfaite
--
-- Ce que ça change : le déversement des réunions échouait, et pour une raison
-- de fond plutôt que technique.
--
-- **Bubble n'enregistre pas la date des réunions.** Un objet `reunion` ne
-- porte que six champs :
--
--     _id · Created Date · Modified Date · Created By · referent · EXCUSE
--
-- Aucune date de tenue. Le déversement se rabat donc sur `Created Date`, qui
-- est la date de **saisie**. Le plus souvent les deux coïncident — on note la
-- réunion le soir même. Mais le 25 février 2026, quelqu'un a rattrapé cinq
-- réunions d'un coup, avec des présences bien distinctes : 3, 5, 11, 14 et 17
-- pointages. Cinq réunions, un seul jour de saisie.
--
-- `reunion_loge_jour_idx` en refusait quatre, et faisait échouer tout le
-- déversement : sur les 24 réunions de Bubble, aucune n'entrait.
--
-- CE QUI CHANGE, ET CE QUI NE CHANGE PAS
--
-- La règle « une loge ne tient pas deux réunions le même jour » reste **entière
-- pour les réunions ouvertes dans HERACLES**. C'est là qu'elle sert : elle
-- attrape le double-clic et la saisie en double, et garantit que deux personnes
-- qui ouvrent l'appel du même soir tombent sur la même feuille.
--
-- Elle ne s'applique plus à ce qui vient de Bubble, où la date qu'on possède
-- n'est pas celle de la réunion. Mieux vaut cinq lignes qui partagent une date
-- que quatre réunions et cinquante pointages perdus le 5 décembre — et perdus
-- pour de bon, puisque l'API de Bubble ne répondra plus.
--
-- Le registre affichera donc cinq fois le 25 février 2026. C'est laid, et c'est
-- vrai : on ne sait pas quand ces réunions se sont tenues, et rien ne permet de
-- le deviner. Inventer des dates aurait été pire.
-- ---------------------------------------------------------------------------

drop index if exists public.reunion_loge_jour_idx;

-- `bubble_id is null` : les réunions ouvertes ici, et elles seules.
create unique index if not exists reunion_loge_jour_idx
  on public.reunion (loge_id, tenue_le)
  where retire_le is null and bubble_id is null;

comment on index public.reunion_loge_jour_idx is
  'Une loge ne tient pas deux réunions le même jour — pour ce qui s''ouvre '
  'dans HERACLES. Ce qui vient de Bubble en est exempt : la seule date '
  'disponible y est celle de la saisie, pas celle de la tenue (0046).';

-- ---------------------------------------------------------------------------
-- Ouvrir une réunion reste déterministe
--
-- `select ... into` sur plusieurs lignes prend la première venue, sans se
-- plaindre : deux appels de suite pourraient rendre deux réunions différentes.
-- Depuis 0046, plusieurs réunions peuvent partager un jour — il faut donc dire
-- laquelle on rouvre.
--
-- Celle d'ici d'abord, la plus ancienne ensuite. Une réunion ouverte dans
-- HERACLES est celle qu'on est en train de tenir ; une réunion de Bubble
-- tombée sur le même jour est un souvenir, et ne doit pas capturer l'appel du
-- soir.
-- ---------------------------------------------------------------------------
create or replace function public.ouvrir_une_reunion(jour date default current_date,
                                                     ou text default null)
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
   where loge_id = la_loge and tenue_le = jour and retire_le is null
   order by (bubble_id is null) desc, cree_le
   limit 1;
  if deja is not null then
    return deja;
  end if;

  -- Aucun pointage n'est posé ici : une feuille qui s'ouvre est vide, et
  -- « vide » n'est pas « absent ». Sur l'écran, « Présent » apparaît seulement
  -- *proposé* à ceux qui sont en ligne, tant que personne n'a cliqué.
  insert into public.reunion (loge_id, tenue_le, lieu, ouverte_par)
  values (la_loge, jour, nullif(btrim(ou), ''), moi)
  returning id into neuve;

  return neuve;
end
$$;

comment on function public.ouvrir_une_reunion(date, text) is
  'Ouvre la réunion du jour pour ma loge, ou rend celle qui existe déjà : '
  'deux personnes qui l''ouvrent en même temps tiennent la même feuille. '
  'Plusieurs réunions pouvant partager un jour depuis 0046, l''ouverture '
  'préfère celle d''ici, puis la plus ancienne.';

revoke all on function public.ouvrir_une_reunion(date, text) from public, anon;
grant execute on function public.ouvrir_une_reunion(date, text) to authenticated;
