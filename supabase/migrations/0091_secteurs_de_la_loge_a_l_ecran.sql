-- ---------------------------------------------------------------------------
-- 0091 — les secteurs de la loge, à l'écran
--
-- Ce que ça change : la page Référents gagne le bloc « Secteurs représentés »
-- (maquette validée le 12 novembre 2026, docs/maquettes/secteurs-d-activite.html,
-- écran 3). Le Secrétaire y coche les secteurs d'activité présents dans sa
-- loge ; les autres référents de la loge les lisent.
--
-- QUI FAIT QUOI
--
--   · LIRE la liste d'une loge : ses référents, et les administrateurs. Pas
--     plus : l'écran ne montre que la loge de la personne connectée. Le jour
--     où la fiche candidat montrera « les loges qui peuvent l'aider », cet
--     écran-là apportera sa propre lecture des autres loges.
--   · COCHER et DÉCOCHER : le Secrétaire de la loge, et les administrateurs en
--     secours (décision n° 10). Le Vénérable Maître n'y est pas : la décision
--     nomme le Secrétaire seul.
--   · CHERCHER un secteur et PARCOURIR la nomenclature : ceux qui peuvent
--     cocher. Un référent qui lit la liste n'a ni champ de recherche ni
--     arborescence à l'écran.
--
-- POURQUOI DES FONCTIONS ET NON DES POLICIES
--
-- Même dessin que l'annuaire (0012) et la fiche (0020) : `loge_secteur` et
-- `code_naf` restent fermées (0086, 0089), et chaque fonction rend exactement
-- ce que le bloc affiche. Aucun GRANT de table : la liste des tables ouvertes
-- en écriture, que garde le test 0007, ne bouge pas.
--
-- LE TITRE DE SECRÉTAIRE
--
-- Il se lit dans `referent.college`, texte libre repris de Bubble. On le
-- compare comme partout ailleurs (0041, 0067) : sans majuscules ni espaces
-- autour, avec ou sans accent sur le « e ».
-- ---------------------------------------------------------------------------

-- 1. Puis-je tenir la liste de cette loge ? ----------------------------------
create or replace function public.puis_je_tenir_les_secteurs(la_loge uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_admin() or exists (
    select 1 from public.referent r
     where r.id = public.referent_courant()
       and r.loge_id = la_loge
       and lower(btrim(r.college)) in ('secrétaire', 'secretaire'))
$$;

comment on function public.puis_je_tenir_les_secteurs(uuid) is
  'Vrai si la session peut cocher les secteurs de cette loge : son Secrétaire, '
  'ou un administrateur.';

revoke all on function public.puis_je_tenir_les_secteurs(uuid) from public, anon;
grant execute on function public.puis_je_tenir_les_secteurs(uuid) to authenticated, service_role;

-- 2. La liste de la loge, telle que le bloc l'affiche ------------------------
-- Rend null à qui ne peut pas la lire : de l'extérieur, une loge inconnue et
-- une loge fermée se ressemblent.
create or replace function public.secteurs_de_la_loge(la_loge uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.est_admin() or la_loge = public.ma_loge() then
    jsonb_build_object(
      'maj_le',     (select l.secteurs_maj_le from public.loge l where l.id = la_loge),
      'modifiable', public.puis_je_tenir_les_secteurs(la_loge),
      'secteurs',   coalesce((
        select jsonb_agg(jsonb_build_object(
                 'code',              c.code,
                 'intitule',          c.intitule,
                 'niveau',            c.niveau,
                 'division',          d.code,
                 'division_intitule', d.intitule,
                 'section',           s.code,
                 'section_intitule',  s.intitule)
               order by c.code)
          from public.loge_secteur ls
          join public.code_naf c on c.code = ls.code
          join public.code_naf d on d.code = left(c.code, 2)
          join public.code_naf s on s.code = d.parent
         where ls.loge_id = la_loge), '[]'::jsonb))
  end
$$;

comment on function public.secteurs_de_la_loge(uuid) is
  'Les secteurs cochés par une loge, avec leur division et leur section, la '
  'date de la liste et si la session peut la modifier. Null pour qui n''est ni '
  'de la loge ni administrateur.';

revoke all on function public.secteurs_de_la_loge(uuid) from public, anon;
grant execute on function public.secteurs_de_la_loge(uuid) to authenticated, service_role;

-- 3. Cocher, décocher ----------------------------------------------------------
-- Rend la liste à jour, pour que l'écran affiche ce que la base a retenu et
-- non ce qu'il croit avoir envoyé. Cocher deux fois, ou décocher ce qui ne
-- l'est pas, ne change rien et ne fait pas d'erreur : deux onglets ouverts
-- ne se contredisent pas.
create or replace function public.cocher_un_secteur(la_loge uuid, le_code text, coche boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puis_je_tenir_les_secteurs(la_loge) then
    raise exception 'Seul le Secrétaire de la loge peut modifier ses secteurs'
      using errcode = 'insufficient_privilege';
  end if;

  if coche then
    insert into public.loge_secteur (loge_id, code, coche_par)
    values (la_loge, le_code, public.referent_courant())
    on conflict (loge_id, code) do nothing;
  else
    delete from public.loge_secteur where loge_id = la_loge and code = le_code;
  end if;

  return public.secteurs_de_la_loge(la_loge);
end
$$;

comment on function public.cocher_un_secteur(uuid, text, boolean) is
  'Coche (ou décoche) un secteur pour une loge, puis rend la liste à jour. '
  'Réservé au Secrétaire de la loge et aux administrateurs.';

revoke all on function public.cocher_un_secteur(uuid, text, boolean) from public, anon;
grant execute on function public.cocher_un_secteur(uuid, text, boolean) to authenticated, service_role;

-- 4. Chercher un secteur à cocher ---------------------------------------------
-- La recherche de 0090, en mode précis, pour qui peut cocher dans sa loge.
create or replace function public.rechercher_secteur_pour_la_loge(recherche text)
returns table (code text, intitule text, niveau text, section text, section_intitule text, rang integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.est_admin() or public.puis_je_tenir_les_secteurs(public.ma_loge())) then
    raise exception 'La recherche de secteurs est réservée au Secrétaire de la loge'
      using errcode = 'insufficient_privilege';
  end if;
  return query select * from public.rechercher_secteur(left(recherche, 120), true);
end
$$;

comment on function public.rechercher_secteur_pour_la_loge(text) is
  'rechercher_secteur(mot, precis => true), pour le Secrétaire d''une loge ou '
  'un administrateur.';

revoke all on function public.rechercher_secteur_pour_la_loge(text) from public, anon;
grant execute on function public.rechercher_secteur_pour_la_loge(text) to authenticated, service_role;

-- 5. Parcourir la nomenclature ------------------------------------------------
-- Les 1 728 lignes, pour l'arborescence à cocher : [code, intitulé, niveau
-- (1 à 5), parent]. Une liste compacte plutôt que des objets : l'écran la
-- charge d'un coup, à l'ouverture de l'arborescence.
create or replace function public.nomenclature_naf_pour_la_loge()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.est_admin() or public.puis_je_tenir_les_secteurs(public.ma_loge())) then
    raise exception 'La nomenclature est réservée au Secrétaire de la loge'
      using errcode = 'insufficient_privilege';
  end if;
  return (
    select jsonb_agg(jsonb_build_array(
             n.code, n.intitule,
             case n.niveau when 'section' then 1 when 'division' then 2
                           when 'groupe' then 3 when 'classe' then 4 else 5 end,
             n.parent)
           order by n.code)
      from public.code_naf n);
end
$$;

comment on function public.nomenclature_naf_pour_la_loge() is
  'Toute la nomenclature NAF, en liste compacte, pour l''arborescence du bloc '
  '« Secteurs représentés ». Réservée au Secrétaire d''une loge et aux '
  'administrateurs.';

revoke all on function public.nomenclature_naf_pour_la_loge() from public, anon;
grant execute on function public.nomenclature_naf_pour_la_loge() to authenticated, service_role;
