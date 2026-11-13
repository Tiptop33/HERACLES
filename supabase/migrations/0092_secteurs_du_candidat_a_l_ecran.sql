-- ---------------------------------------------------------------------------
-- 0092 — les secteurs du candidat, à l'écran
--
-- Ce que ça change : deux écrans validés le 12 novembre 2026
-- (docs/maquettes/secteurs-d-activite.html, écrans 1 et 2 ; décisions 6, 8,
-- 12 à 14) prennent appui sur `candidat_secteur` (0088).
--
--   1. Le formulaire de candidature : le candidat propose jusqu'à trois
--      secteurs, classés. Ils partent avec la fiche.
--   2. La fiche candidat, bloc « Sa recherche » : le référent les voit, les
--      confirme, les corrige sur place — chaque geste s'enregistre aussitôt.
--      Ce qu'il ajoute est confirmé d'office.
--
-- QUI FAIT QUOI
--
--   · LIRE les secteurs d'un candidat : exactement qui lit sa fiche
--     (`fiche_candidat`, 0057) — l'administration, son référent, son parrain,
--     et les référents des loges qui la voient.
--   · LES MODIFIER et LES CONFIRMER : exactement qui modifie la fiche — son
--     référent et son parrain (la colonne `modifiable` de la fiche).
--   · LES PROPOSER : le candidat, par le lien de sa candidature, tant qu'il
--     vaut — même chemin que `completer_sa_candidature` (0066) : la route web
--     hache le jeton et appelle avec la clé de service.
--   · CHERCHER un secteur et PARCOURIR la liste (sections et divisions) : les
--     référents et l'administration ; le candidat par son lien.
--
-- Aucun GRANT de table : tout passe par ces fonctions, comme pour la fiche.
-- La liste que garde le test 0007 ne bouge pas.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Les secteurs d'un candidat, tels que la fiche les montre
-- ===========================================================================

-- Les droits de la fiche, en deux questions. Mêmes conditions que
-- `fiche_candidat` (0057), écrites une fois.
create or replace function public.puis_je_lire_les_secteurs_du_candidat(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (public.est_admin()
         or c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()
         or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))))
$$;

create or replace function public.puis_je_modifier_les_secteurs_du_candidat(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()))
$$;

revoke all on function public.puis_je_lire_les_secteurs_du_candidat(uuid) from public, anon;
grant execute on function public.puis_je_lire_les_secteurs_du_candidat(uuid) to authenticated, service_role;
revoke all on function public.puis_je_modifier_les_secteurs_du_candidat(uuid) from public, anon;
grant execute on function public.puis_je_modifier_les_secteurs_du_candidat(uuid) to authenticated, service_role;

-- La liste, sans contrôle : réservée aux fonctions de ce fichier.
create or replace function public.liste_des_secteurs_du_candidat(le_candidat uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rang',             cs.rang,
           'code',             c.code,
           'intitule',         c.intitule,
           'niveau',           c.niveau,
           'section',          s.code,
           'section_intitule', s.intitule,
           'propose_par',      cs.propose_par,
           'confirme_le',      cs.confirme_le,
           'confirme_par',     nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''))
         order by cs.rang), '[]'::jsonb)
    from public.candidat_secteur cs
    join public.code_naf c on c.code = cs.code
    join public.code_naf s on s.code = coalesce(c.parent, c.code)
    left join public.referent r on r.id = cs.confirme_par
   where cs.candidat_id = le_candidat
$$;

revoke all on function public.liste_des_secteurs_du_candidat(uuid) from public, anon, authenticated;

-- Ce que le bloc « Sa recherche » affiche. Null pour qui ne lit pas la fiche :
-- de l'extérieur, un candidat inconnu et une fiche fermée se ressemblent.
--
-- `repris_de_bubble` : le texte libre que l'ancienne application portait
-- (`candidat.secteur_activite_libelle`), affiché tant que le référent n'a pas
-- confirmé les secteurs (décision 14) — c'est-à-dire tant qu'il n'y en a
-- aucun, ou qu'un seul reste à confirmer.
create or replace function public.secteurs_du_candidat(le_candidat uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  liste jsonb;
  texte text;
begin
  if not public.puis_je_lire_les_secteurs_du_candidat(le_candidat) then
    return null;
  end if;
  liste := public.liste_des_secteurs_du_candidat(le_candidat);
  select nullif(btrim(c.secteur_activite_libelle), '') into texte
    from public.candidat c where c.id = le_candidat;

  return jsonb_build_object(
    'modifiable', public.puis_je_modifier_les_secteurs_du_candidat(le_candidat),
    'secteurs',   liste,
    'repris_de_bubble', case
      when texte is not null
       and (jsonb_array_length(liste) = 0
            or exists (select 1 from jsonb_array_elements(liste) e where e ->> 'confirme_le' is null))
      then texte end);
end
$$;

comment on function public.secteurs_du_candidat(uuid) is
  'Les secteurs d''un candidat pour le bloc « Sa recherche » de sa fiche : la '
  'liste classée, l''état de chaque secteur, si la session peut les modifier, '
  'et le texte repris de Bubble tant qu''ils ne sont pas tous confirmés. Null '
  'pour qui ne lit pas la fiche.';

revoke all on function public.secteurs_du_candidat(uuid) from public, anon;
grant execute on function public.secteurs_du_candidat(uuid) to authenticated, service_role;

-- ===========================================================================
-- 2. Le référent les corrige et les confirme, sur la fiche
-- ===========================================================================

-- La liste voulue, dans l'ordre : trois codes au plus, chacun une fois. Un
-- secteur déjà là garde son origine et sa confirmation, même s'il change de
-- rang ; un secteur nouveau est ajouté par le référent, donc confirmé d'office
-- (décision 13). Ceux qui n'y sont plus partent.
create or replace function public.ecrire_les_secteurs_du_candidat(le_candidat uuid, codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  avant   jsonb;
  i       integer;
  ancien  jsonb;
begin
  if not public.puis_je_modifier_les_secteurs_du_candidat(le_candidat) then
    raise exception 'Seuls le référent et le parrain du candidat modifient ses secteurs'
      using errcode = 'insufficient_privilege';
  end if;
  codes := coalesce(codes, '{}');
  if cardinality(codes) > 3 then
    raise exception 'Trois secteurs au plus' using errcode = 'check_violation';
  end if;
  if cardinality(codes) <> (select count(distinct x) from unnest(codes) x) then
    raise exception 'Le même secteur deux fois' using errcode = 'check_violation';
  end if;

  -- Ce qui était là, pour garder l'origine et la confirmation de chacun.
  select coalesce(jsonb_object_agg(cs.code, jsonb_build_object(
           'propose_par', cs.propose_par, 'confirme_par', cs.confirme_par,
           'confirme_le', cs.confirme_le, 'cree_le', cs.cree_le)), '{}'::jsonb)
    into avant
    from public.candidat_secteur cs where cs.candidat_id = le_candidat;

  -- Le rang est la clé : on repose la liste entière.
  delete from public.candidat_secteur where candidat_id = le_candidat;
  for i in 1 .. cardinality(codes) loop
    ancien := avant -> codes[i];
    if ancien is not null then
      insert into public.candidat_secteur
        (candidat_id, rang, code, propose_par, confirme_par, confirme_le, cree_le)
      values (le_candidat, i, codes[i], ancien ->> 'propose_par',
              (ancien ->> 'confirme_par')::uuid, (ancien ->> 'confirme_le')::timestamptz,
              (ancien ->> 'cree_le')::timestamptz);
    else
      insert into public.candidat_secteur
        (candidat_id, rang, code, propose_par, confirme_par, confirme_le)
      values (le_candidat, i, codes[i], 'referent', moi, now());
    end if;
  end loop;

  return public.secteurs_du_candidat(le_candidat);
end
$$;

comment on function public.ecrire_les_secteurs_du_candidat(uuid, text[]) is
  'Pose la liste des secteurs d''un candidat, dans l''ordre (trois au plus). '
  'Un secteur gardé garde son origine et sa confirmation ; un secteur ajouté '
  'est confirmé d''office. Réservé au référent et au parrain du candidat.';

revoke all on function public.ecrire_les_secteurs_du_candidat(uuid, text[]) from public, anon;
grant execute on function public.ecrire_les_secteurs_du_candidat(uuid, text[]) to authenticated, service_role;

create or replace function public.confirmer_un_secteur_du_candidat(le_candidat uuid, le_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puis_je_modifier_les_secteurs_du_candidat(le_candidat) then
    raise exception 'Seuls le référent et le parrain du candidat confirment ses secteurs'
      using errcode = 'insufficient_privilege';
  end if;
  update public.candidat_secteur
     set confirme_par = public.referent_courant(),
         confirme_le  = now()
   where candidat_id = le_candidat and code = le_code and confirme_le is null;
  return public.secteurs_du_candidat(le_candidat);
end
$$;

revoke all on function public.confirmer_un_secteur_du_candidat(uuid, text) from public, anon;
grant execute on function public.confirmer_un_secteur_du_candidat(uuid, text) to authenticated, service_role;

-- ===========================================================================
-- 3. Chercher, parcourir : sections et divisions
-- ===========================================================================

-- Les 21 sections et 88 divisions, en liste compacte [code, intitulé, niveau,
-- parent] : ce qu'un candidat peut choisir, pour « Parcourir la liste ».
create or replace function public.sections_et_divisions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_agg(jsonb_build_array(
           n.code, n.intitule, case n.niveau when 'section' then 1 else 2 end, n.parent)
         order by n.code)
    from public.code_naf n
   where n.niveau in ('section', 'division')
$$;

revoke all on function public.sections_et_divisions() from public, anon, authenticated;
grant execute on function public.sections_et_divisions() to service_role;

-- Pour la fiche : les référents et l'administration.
create or replace function public.rechercher_secteur_pour_un_candidat(recherche text)
returns table (code text, intitule text, niveau text, section text, section_intitule text, rang integer,
               trouve_par text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_referent_ou_admin() then
    raise exception 'La recherche de secteurs est réservée aux référents'
      using errcode = 'insufficient_privilege';
  end if;
  return query select * from public.rechercher_secteur(left(recherche, 120), false);
end
$$;

revoke all on function public.rechercher_secteur_pour_un_candidat(text) from public, anon;
grant execute on function public.rechercher_secteur_pour_un_candidat(text) to authenticated, service_role;

create or replace function public.sections_et_divisions_pour_un_candidat()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_referent_ou_admin() then
    raise exception 'La liste des secteurs est réservée aux référents'
      using errcode = 'insufficient_privilege';
  end if;
  return public.sections_et_divisions();
end
$$;

revoke all on function public.sections_et_divisions_pour_un_candidat() from public, anon;
grant execute on function public.sections_et_divisions_pour_un_candidat() to authenticated, service_role;

-- ===========================================================================
-- 4. Le candidat, par le lien de sa candidature
-- ===========================================================================

-- Le candidat que désigne une empreinte, si le lien vaut encore : mêmes
-- conditions que `completer_sa_candidature` (0066) — un parrainage ni révoqué
-- ni expiré, une fiche pas encore envoyée.
create or replace function public.candidat_de_la_candidature(empreinte text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.parrainage p
    join public.candidat c on c.id = p.candidat_id
   where empreinte is not null
     and empreinte ~ '^[0-9a-f]{64}$'
     and p.jeton_candidat_empreinte = empreinte
     and p.revoque_le is null
     and p.candidat_expire_le > now()
     and c.candidature_completee_le is null
$$;

revoke all on function public.candidat_de_la_candidature(text) from public, anon, authenticated;
grant execute on function public.candidat_de_la_candidature(text) to service_role;

-- Proposer ses secteurs, avec la fiche. Ils remplacent ceux du candidat, tous
-- « proposés par le candidat », à confirmer. Une liste vide ne change rien :
-- le candidat qui ne choisit rien n'efface pas ce que son référent aurait
-- déjà posé.
create or replace function public.proposer_les_secteurs_de_la_candidature(empreinte text, codes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  le_candidat uuid := public.candidat_de_la_candidature(empreinte);
  i integer;
begin
  if le_candidat is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  codes := coalesce(codes, '{}');
  if cardinality(codes) = 0 then
    return;
  end if;
  if cardinality(codes) > 3 then
    raise exception 'Trois secteurs au plus' using errcode = 'check_violation';
  end if;
  if cardinality(codes) <> (select count(distinct x) from unnest(codes) x) then
    raise exception 'Le même secteur deux fois' using errcode = 'check_violation';
  end if;

  delete from public.candidat_secteur where candidat_id = le_candidat;
  for i in 1 .. cardinality(codes) loop
    insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
    values (le_candidat, i, codes[i], 'candidat');
  end loop;
end
$$;

comment on function public.proposer_les_secteurs_de_la_candidature(text, text[]) is
  'Les secteurs que le candidat propose dans son formulaire (trois au plus, '
  'classés), à confirmer par son référent. Par le lien de sa candidature, '
  'tant qu''il vaut ; avec la clé de service.';

revoke all on function public.proposer_les_secteurs_de_la_candidature(text, text[]) from public, anon, authenticated;
grant execute on function public.proposer_les_secteurs_de_la_candidature(text, text[]) to service_role;

create or replace function public.rechercher_secteur_par_la_candidature(empreinte text, recherche text)
returns table (code text, intitule text, niveau text, section text, section_intitule text, rang integer,
               trouve_par text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.candidat_de_la_candidature(empreinte) is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  return query select * from public.rechercher_secteur(left(recherche, 120), false);
end
$$;

revoke all on function public.rechercher_secteur_par_la_candidature(text, text) from public, anon, authenticated;
grant execute on function public.rechercher_secteur_par_la_candidature(text, text) to service_role;

create or replace function public.sections_et_divisions_par_la_candidature(empreinte text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.candidat_de_la_candidature(empreinte) is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  return public.sections_et_divisions();
end
$$;

revoke all on function public.sections_et_divisions_par_la_candidature(text) from public, anon, authenticated;
grant execute on function public.sections_et_divisions_par_la_candidature(text) to service_role;
