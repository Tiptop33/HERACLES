-- ---------------------------------------------------------------------------
-- 0054 — celui qui ouvre l'appel se marque présent lui aussi
--
-- Ce que ça change : ouvrir l'appel pose « Présent » sur sa propre ligne, en
-- plus de celles des connectés. Depuis 0053, la feuille s'ouvrait remplie sauf
-- pour une personne — celle qui venait de l'ouvrir. C'était la seule case
-- vide, et la moins justifiable : sur une feuille d'appel, celui qui tient
-- l'appel est la personne dont la présence fait le moins de doute.
--
-- POURQUOI IL FALLAIT UNE LIGNE DE PLUS, ET NON UNE CORRECTION DE 0042
--
-- `les_connectes()` exclut l'appelant : `r.id is distinct from
-- referent_courant()`. Ce n'est pas un oubli. Cette fonction a été écrite pour
-- la colonne de gauche, où elle dit « qui d'autre est là en ce moment » — s'y
-- voir soi-même n'apprendrait rien.
--
-- Le pointage réutilise cette liste plutôt que de réécrire son critère, et
-- c'est ce qui garantit qu'il marque exactement les gens que l'écran montre.
-- Il en hérite donc l'exclusion, qui n'a plus de sens dans ce contexte-ci.
--
-- Corriger `les_connectes()` aurait fait apparaître chacun dans sa propre
-- colonne de gauche : un écran modifié par ricochet, pour un besoin qui
-- n'était pas le sien. D'où cette ligne à part, ici, où elle se lit.
--
-- ELLE N'ÉCRASE RIEN NON PLUS
--
-- `on conflict do nothing`, comme tout ce qui touche à cette feuille. Celui
-- qui s'est noté « Excusé » — il tient l'appel à distance — puis rouvre la
-- feuille reste excusé. Sa réponse est une information ; l'ouverture n'a pas à
-- la défaire.
--
-- CE QUE ÇA NE CHANGE PAS
--
--   · `les_connectes()` — inchangée. La colonne de gauche ne montre toujours
--     que les autres.
--   · `pointer_les_connectes()` — inchangée. Le bouton « Présents : les N en
--     ligne » ne marque toujours que les autres : c'est un raccourci du geste
--     un à un, et l'on ne se coche pas soi-même en cochant quelqu'un d'autre.
--
-- Se marquer présent est attaché à **l'ouverture**, et à elle seule : c'est le
-- geste qui prouve qu'on est là.
--
-- Le corps reprend celui de 0053, avec les deux sorties ramenées à une seule —
-- le pointage n'avait pas à être écrit deux fois.
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
  la_loge     uuid := public.ma_loge();
  la_reunion  uuid;
begin
  -- ouvrir_une_reunion — version 0054
  -- (ce repère sert au garde-fou du test de 0046 : voir ce fichier de test.)
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

  -- Et moi. `les_connectes()` ne me rendra jamais — voir l'en-tête.
  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  values (la_reunion, moi, 'Présent', moi, now())
  on conflict (reunion_id, referent_id) do nothing;

  return la_reunion;
end
$$;

comment on function public.ouvrir_une_reunion(date, text) is
  'Ouvre la réunion du jour pour ma loge, ou rend celle qui existe déjà : '
  'deux personnes qui l''ouvrent en même temps tiennent la même feuille. '
  'Plusieurs réunions pouvant partager un jour depuis 0046, l''ouverture '
  'préfère celle d''ici, puis la plus ancienne. Depuis 0053 elle pose '
  '« Présent » sur les référents en ligne, et depuis 0054 sur moi aussi — '
  'sans jamais écraser un état déjà posé.';

revoke all on function public.ouvrir_une_reunion(date, text) from public, anon;
grant execute on function public.ouvrir_une_reunion(date, text) to authenticated;
