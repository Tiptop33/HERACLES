-- ---------------------------------------------------------------------------
-- 0053 — les connectés pointés dès que l'appel s'ouvre
--
-- Ce que ça change : ouvrir l'appel pose « Présent » sur les référents de la
-- loge dont la session est ouverte. Jusqu'ici la feuille s'ouvrait vide et il
-- fallait un geste de plus — un clic par ligne, ou le bouton de groupe de
-- 0052. Ce geste se faisait de toute façon, et toujours le même : il se fait
-- maintenant tout seul.
--
-- CE QU'IL FAUT SAVOIR AVANT DE S'Y FIER
--
-- « En ligne » veut dire *session ouverte*, avec le garde-fou de douze heures
-- de 0042. Quelqu'un qui a laissé un onglet ouvert la veille au soir sera donc
-- compté présent sans que personne ne l'ait décidé. C'était la raison du
-- pointillé : la feuille distinguait « on sait qu'il est connecté » de
-- « quelqu'un a répondu à son nom ». Cette distinction disparaît à l'ouverture
-- — elle a été demandée, elle est notée ici pour que le jour où un chiffre
-- d'assiduité étonne, on sache où regarder. Chaque ligne se corrige d'un clic.
--
-- ELLE N'ÉCRASE RIEN
--
-- Tout le travail est délégué à `pointer_les_connectes()` (0052), avec son
-- `on conflict do nothing` : ouvrir ne remplit que les cases vides. Un
-- « Excusé » ou un « Absent » posé à la main sur une feuille qu'on rouvre
-- reste intact, et rouvrir dix fois de suite ne défait rien.
--
-- Déléguer plutôt que réécrire l'insert est ce qui garantit que l'ouverture
-- marque exactement ceux que le bouton de 0052 marquerait, et exactement ceux
-- que l'écran montre en pointillé. Deux définitions de « en ligne » auraient
-- divergé un jour.
--
-- À L'OUVERTURE, ET LÀ SEULEMENT
--
-- Les deux sorties de la fonction pointent, parce que les deux sont « ouvrir
-- l'appel » du point de vue de celui qui clique : celle qui crée la réunion,
-- et celle qui retombe sur la feuille du soir déjà ouverte par un autre.
--
-- Reprendre une feuille par le stylo du registre, en revanche, ne pointe pas :
-- c'est une lecture d'écran, et une lecture n'écrit pas. Le bouton
-- « Présents : les N en ligne » de 0052 reste donc en place — c'est lui qui
-- rattrape ceux qui se connectent après l'ouverture.
--
-- CELUI QUI TIENT L'APPEL NE SE POINTE PAS
--
-- `les_connectes()` exclut l'appelant depuis 0042, et la feuille ne lui
-- propose pas davantage son propre bouton. Il coche sa ligne comme les autres.
-- Rien de neuf, mais c'est la première question qu'on se posera devant
-- l'écran : sa case est la seule restée vide.
--
-- Le corps reprend celui de 0046 — recherche de la réunion du jour comprise —
-- avec le pointage en plus.
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
  -- même soir doivent tomber sur la même feuille. Celle d'ici d'abord, la plus
  -- ancienne ensuite (0046).
  select id into deja from public.reunion
   where loge_id = la_loge and tenue_le = jour and retire_le is null
   order by (bubble_id is null) desc, cree_le
   limit 1;

  if deja is not null then
    -- Retomber sur la feuille du soir, c'est encore ouvrir l'appel : celui qui
    -- s'est connecté depuis est pointé lui aussi. Sans écraser personne.
    perform public.pointer_les_connectes(deja);
    return deja;
  end if;

  insert into public.reunion (loge_id, tenue_le, lieu, ouverte_par)
  values (la_loge, jour, nullif(btrim(ou), ''), moi)
  returning id into neuve;

  -- La feuille ne s'ouvre plus vide : ceux qui sont en ligne y sont déjà.
  perform public.pointer_les_connectes(neuve);

  return neuve;
end
$$;

comment on function public.ouvrir_une_reunion(date, text) is
  'Ouvre la réunion du jour pour ma loge, ou rend celle qui existe déjà : '
  'deux personnes qui l''ouvrent en même temps tiennent la même feuille. '
  'Plusieurs réunions pouvant partager un jour depuis 0046, l''ouverture '
  'préfère celle d''ici, puis la plus ancienne. Depuis 0053, elle pose '
  '« Présent » sur les référents en ligne — sans écraser aucun état déjà posé, '
  'et sans se pointer soi-même.';

revoke all on function public.ouvrir_une_reunion(date, text) from public, anon;
grant execute on function public.ouvrir_une_reunion(date, text) to authenticated;
