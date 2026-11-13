-- ---------------------------------------------------------------------------
-- 0093 — les secteurs repris de Bubble
--
-- Ce que ça change : les secteurs que l'ancienne application portait sur les
-- fiches rejoignent la nomenclature NAF (0086), et donc les secteurs du
-- candidat (0088). L'administration valide, dans Paramètres › Secteurs
-- d'activité, le secteur qui correspond à chaque secteur Bubble ; la
-- correspondance s'applique aussitôt aux fiches, puis à chaque reprise
-- jusqu'à la bascule du 5 décembre 2026 (décision 7, maquette validée le
-- 13 novembre : docs/maquettes/secteurs-repris-de-bubble.html).
--
-- D'où viennent les secteurs (relevé du 13 novembre 2026 sur la base en
-- service, 122 fiches — des comptes, aucune donnée relevée) :
--
--   * `SECTEUR ACTIVITE ROME` → `candidat.secteur_activite_rome_bubble_id`,
--     un lien vers la liste Bubble `secteuractiviterome` (14 domaines, son
--     intitulé dans `INTITULE_ROME`) : 21 fiches, 8 secteurs ;
--   * `Candidat_SA` → `candidat.secteur_activite_libelle`, un texte libre :
--     15 fiches, toutes archivées, 8 textes ;
--   * `Code_NAF_Candidats` → `candidat.code_naf_bubble_id`, un lien vers la
--     liste Bubble `codes_naf`, qui porte déjà un code de la même
--     nomenclature (« 32.91Z ») : 5 fiches. Celles-ci passent **d'office**,
--     sans validation : leur division se lit dans le code (décision du
--     13 novembre).
--   * `SECTEUR-ACTIVITE-CAND`, la source d'abord retenue, n'est rempli sur
--     aucune fiche : il est laissé de côté.
--
-- Les deux listes Bubble n'existent que dans la base de l'éditeur : la reprise
-- les recopie dans `bubble_brut` (passe 2 de reprendre-bubble.sh). Elles sont
-- lues par l'identifiant Bubble seul, quel que soit le nom du type : Bubble
-- ne réutilise pas un identifiant d'un type à l'autre.
--
-- Ce que l'on garde : la **décision** de l'administration, une ligne par
-- secteur Bubble — le secteur NAF retenu, ou aucun (« Aucun ne convient »).
-- La liste des secteurs Bubble elle-même se recalcule à partir des fiches :
-- elle suit chaque reprise sans rien recopier.
--
-- Ce que l'on applique, et à quelles fiches : à une fiche qui n'a aucun
-- secteur, ou dont tous les secteurs sont encore ceux de la reprise, non
-- confirmés. Ceux-là sont l'œuvre de HERACLES, pas de quelqu'un : une
-- correspondance changée les remplace. Dès qu'un référent confirme, corrige
-- ou qu'un candidat propose, la fiche n'est plus touchée. Les secteurs repris
-- arrivent avec `propose_par = 'reprise'`, à confirmer sur la fiche
-- (« repris de Bubble · à confirmer », décision 14).
--
-- Ordre, quand une fiche en a plusieurs : le code NAF de Bubble d'abord (le
-- plus précis), puis la liste ROME, puis le texte libre. Trois au plus.
--
-- Accès : la table est fermée (RLS, aucune policy, aucun droit). L'écran
-- passe par deux fonctions réservées à l'administration ; l'application aux
-- fiches est aussi lancée par la reprise, avec le rôle propriétaire.
-- ---------------------------------------------------------------------------

-- 1. La décision de l'administration -----------------------------------------
create table if not exists public.secteur_bubble (
  -- `rome` : l'identifiant Bubble du secteur ROME ;
  -- `texte` : le texte libre, ramené à sa clé (voir `cle_de_secteur_bubble`).
  source      text not null check (source in ('rome', 'texte')),
  valeur      text not null check (btrim(valeur) <> ''),
  -- Le secteur retenu : une section ou une division. Vide = aucun ne convient,
  -- les fiches gardent seulement le texte de Bubble.
  code        text references public.code_naf (code),
  valide_par  uuid references public.profil (id) on delete set null,
  valide_le   timestamptz not null default now(),
  primary key (source, valeur)
);

comment on table public.secteur_bubble is
  'La correspondance validée entre un secteur de l''ancienne application Bubble '
  '(liste ROME ou texte libre) et la nomenclature NAF. Une ligne = une décision '
  'de l''administration ; code vide = aucun secteur ne convient.';

drop trigger if exists secteur_bubble_niveau on public.secteur_bubble;
create trigger secteur_bubble_niveau
  before insert or update of code on public.secteur_bubble
  for each row execute function public.exiger_niveau_naf('section', 'division');

alter table public.secteur_bubble enable row level security;

-- 2. Ce que portent les fiches -------------------------------------------------

-- La clé d'un texte libre : sans accents, sans majuscules, les blancs réduits.
-- « Bâtiment » et « batiment  » sont le même secteur Bubble.
create or replace function public.cle_de_secteur_bubble(texte text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(public.naf_sans_accent(regexp_replace(btrim(coalesce(texte, '')), '\s+', ' ', 'g')), '')
$$;

revoke all on function public.cle_de_secteur_bubble(text) from public, anon, authenticated;

-- Un champ texte d'un enregistrement de la réserve brute, par son identifiant.
create or replace function public.donnee_bubble(l_id text, le_champ text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(b.donnees ->> le_champ), '')
    from public.bubble_brut b
   where b.bubble_id = btrim(l_id)
   order by b.recupere_le desc
   limit 1
$$;

revoke all on function public.donnee_bubble(text, text) from public, anon, authenticated;

-- L'intitulé d'un enregistrement de la réserve brute, par son identifiant
-- Bubble : `INTITULE_ROME` pour la liste ROME, sinon le premier champ texte
-- qui s'appelle intitulé, libellé ou nom.
create or replace function public.intitule_bubble(l_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(btrim(b.donnees ->> 'INTITULE_ROME'), ''),
           (select nullif(btrim(e.value), '')
              from jsonb_each_text(b.donnees) e
             where e.key ~* '^[[:space:]]*(intitul|libell|nom|name)'
               and jsonb_typeof(b.donnees -> e.key) = 'string'
               and btrim(e.value) <> ''
             order by length(e.key), e.key
             limit 1))
    from public.bubble_brut b
   where b.bubble_id = btrim(l_id)
   order by b.recupere_le desc
   limit 1
$$;

revoke all on function public.intitule_bubble(text) from public, anon, authenticated;

-- Les secteurs Bubble présents sur les fiches, avec leur nombre de fiches.
create or replace function public.secteurs_bubble_des_fiches()
returns table (source text, valeur text, libelle text, fiches bigint)
language sql
stable
security definer
set search_path = public
as $$
  select 'rome', r.valeur, public.intitule_bubble(r.valeur), r.fiches
    from (select btrim(c.secteur_activite_rome_bubble_id) as valeur, count(*) as fiches
            from public.candidat c
           where nullif(btrim(c.secteur_activite_rome_bubble_id), '') is not null
           group by 1) r
  union all
  -- Le texte le plus fréquent sous une même clé donne l'intitulé affiché.
  select 'texte', t.cle,
         mode() within group (order by regexp_replace(btrim(t.brut), '\s+', ' ', 'g')),
         count(*)
    from (select public.cle_de_secteur_bubble(c.secteur_activite_libelle) as cle,
                 c.secteur_activite_libelle as brut
            from public.candidat c) t
   where t.cle is not null
   group by t.cle
$$;

revoke all on function public.secteurs_bubble_des_fiches() from public, anon, authenticated;

-- 3. La proposition --------------------------------------------------------
-- Le secteur que HERACLES propose pour un intitulé Bubble : la recherche de
-- la fiche (0090) sur l'intitulé entier, sinon mot par mot. « Autre » ne
-- propose rien : il trouverait « S — Autres activités de services ». Rend
-- { code, mot } — `mot` dit d'après quel mot, quand ce n'est pas l'intitulé
-- entier — ou null.
create or replace function public.proposer_un_secteur_bubble(libelle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  entier  text := btrim(regexp_replace(coalesce(libelle, ''), '\m(autres?)\M', ' ', 'gi'));
  mot     text;
  trouve  text;
begin
  if public.naf_sans_accent(entier) !~ '[a-z0-9]' then
    return null;
  end if;
  select r.code into trouve
    from public.rechercher_secteur(entier) r
   where r.niveau in ('section', 'division')
   order by r.rang
   limit 1;
  if trouve is not null then
    return jsonb_build_object('code', trouve, 'mot', null);
  end if;

  for mot in
    select m from regexp_split_to_table(libelle, '[[:space:][:punct:]’«»–—]+') with ordinality as x(m, n)
     where length(public.naf_sans_accent(m)) >= 3
       and public.naf_sans_accent(m) not in ('les', 'des', 'aux', 'par', 'pour', 'une', 'sur', 'dans',
                                             'avec', 'sans', 'hors', 'que', 'qui', 'son', 'ses', 'leur',
                                             'leurs', 'autre', 'autres', 'et')
     order by n
  loop
    select r.code into trouve
      from public.rechercher_secteur(mot) r
     where r.niveau in ('section', 'division')
     order by r.rang
     limit 1;
    if trouve is not null then
      return jsonb_build_object('code', trouve, 'mot', lower(mot));
    end if;
  end loop;
  return null;
end
$$;

revoke all on function public.proposer_un_secteur_bubble(text) from public, anon, authenticated;

-- 4. L'application aux fiches ------------------------------------------------
-- Rejouable : une fiche déjà à jour n'est pas réécrite, ni une fiche dont le
-- référent a seulement changé l'ordre. Rend le nombre de fiches dont les
-- secteurs ont changé.
--
-- Limite connue : un secteur repris que le référent retire, sans confirmer
-- les autres, revient à la reprise suivante — rien ne garde la trace d'un
-- retrait. Confirmer ce qui reste suffit à figer la fiche.
create or replace function public.appliquer_les_secteurs_bubble()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche   record;
  changes integer := 0;
begin
  for fiche in
    with voulus as (
      -- Le code NAF de Bubble : sa division, si la nomenclature la connaît.
      select c.id as candidat_id, d.code, 1 as ordre
        from public.candidat c
        join lateral (
          select left(regexp_replace(coalesce(public.donnee_bubble(c.code_naf_bubble_id, 'code_naf'), ''),
                                     '[^0-9]', '', 'g'), 2) as code
        ) x on true
        join public.code_naf d on d.code = x.code and d.niveau = 'division'
       where nullif(btrim(c.code_naf_bubble_id), '') is not null
      union all
      select c.id, sb.code, 2
        from public.candidat c
        join public.secteur_bubble sb
          on sb.source = 'rome' and sb.valeur = btrim(c.secteur_activite_rome_bubble_id)
       where sb.code is not null
      union all
      select c.id, sb.code, 3
        from public.candidat c
        join public.secteur_bubble sb
          on sb.source = 'texte' and sb.valeur = public.cle_de_secteur_bubble(c.secteur_activite_libelle)
       where sb.code is not null
    ),
    -- Une fiche se touche si rien n'y a été fait par une personne.
    libres as (
      select c.id
        from public.candidat c
       where not exists (select 1 from public.candidat_secteur cs
                          where cs.candidat_id = c.id
                            and (cs.propose_par <> 'reprise' or cs.confirme_le is not null))
    )
    select l.id,
           coalesce((select array_agg(cs.code order by cs.rang)
                       from public.candidat_secteur cs where cs.candidat_id = l.id), '{}') as avant,
           coalesce((select array_agg(v.code order by v.ordre, v.code)
                       from (select v.code, min(v.ordre) as ordre
                               from voulus v where v.candidat_id = l.id
                              group by v.code
                              order by min(v.ordre), v.code
                              limit 3) v), '{}') as apres
      from libres l
  loop
    -- Le même ensemble dans un autre ordre : le référent a reclassé, on laisse.
    continue when (select coalesce(array_agg(x order by x), '{}') from unnest(fiche.avant) x)
                = (select coalesce(array_agg(x order by x), '{}') from unnest(fiche.apres) x);
    delete from public.candidat_secteur where candidat_id = fiche.id;
    insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
    select fiche.id, u.n, u.code, 'reprise'
      from unnest(fiche.apres) with ordinality as u(code, n);
    changes := changes + 1;
  end loop;
  return changes;
end
$$;

comment on function public.appliquer_les_secteurs_bubble() is
  'Pose sur les fiches les secteurs repris de Bubble : le code NAF de Bubble '
  'd''office, puis les correspondances validées. Ne touche qu''aux fiches sans '
  'secteur ou dont les secteurs sont encore ceux de la reprise, non confirmés. '
  'Rejouable ; rend le nombre de fiches changées. Lancée par l''écran et par '
  'reprendre-bubble.sh.';

revoke all on function public.appliquer_les_secteurs_bubble() from public, anon, authenticated;

-- 5. L'écran : Paramètres › Secteurs d'activité ------------------------------

-- Un secteur de la nomenclature, tel que l'écran l'affiche.
create or replace function public.secteur_naf_a_l_ecran(le_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('code', c.code, 'intitule', c.intitule, 'niveau', c.niveau,
                            'section', s.code, 'section_intitule', s.intitule)
    from public.code_naf c
    join public.code_naf s on s.code = coalesce(c.parent, c.code)
   where c.code = le_code
$$;

revoke all on function public.secteur_naf_a_l_ecran(text) from public, anon, authenticated;

-- La liste de l'écran : chaque secteur Bubble, ses fiches, la proposition, la
-- décision. Les plus fréquents d'abord.
create or replace function public.secteurs_repris_de_bubble()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Les secteurs repris de Bubble se règlent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'source',    f.source,
             'valeur',    f.valeur,
             'libelle',   f.libelle,
             'fiches',    f.fiches,
             'etat',      case when sb.valeur is null then 'a_valider'
                               when sb.code is null then 'sans' else 'valide' end,
             'code',      public.secteur_naf_a_l_ecran(sb.code),
             'propose',   case when sb.valeur is null and p.choix is not null
                               then public.secteur_naf_a_l_ecran(p.choix ->> 'code')
                                    || jsonb_build_object('mot', p.choix -> 'mot') end,
             'valide_le', sb.valide_le)
           order by f.fiches desc, f.libelle, f.valeur), '[]'::jsonb)
      from public.secteurs_bubble_des_fiches() f
      left join public.secteur_bubble sb on sb.source = f.source and sb.valeur = f.valeur
      left join lateral (
        select public.proposer_un_secteur_bubble(f.libelle) as choix where sb.valeur is null
      ) p on true
  );
end
$$;

comment on function public.secteurs_repris_de_bubble() is
  'Paramètres › Secteurs d''activité : les secteurs Bubble présents sur les '
  'fiches, leur nombre de fiches, le secteur proposé et la décision. '
  'Administration seulement.';

revoke all on function public.secteurs_repris_de_bubble() from public, anon;
grant execute on function public.secteurs_repris_de_bubble() to authenticated, service_role;

-- Valider, changer, ou « aucun ne convient » (le_code vide), puis appliquer
-- aussitôt. Rend la liste à jour.
create or replace function public.regler_un_secteur_bubble(la_source text, la_valeur text, le_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Les secteurs repris de Bubble se règlent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.secteurs_bubble_des_fiches() f
                  where f.source = la_source and f.valeur = la_valeur) then
    raise exception 'Ce secteur Bubble n''est porté par aucune fiche'
      using errcode = 'no_data_found';
  end if;
  le_code := nullif(btrim(le_code), '');

  insert into public.secteur_bubble as sb (source, valeur, code, valide_par, valide_le)
  values (la_source, la_valeur, le_code, auth.uid(), now())
  on conflict (source, valeur) do update
    set code = excluded.code, valide_par = excluded.valide_par, valide_le = excluded.valide_le;

  perform public.appliquer_les_secteurs_bubble();
  return public.secteurs_repris_de_bubble();
end
$$;

comment on function public.regler_un_secteur_bubble(text, text, text) is
  'Paramètres › Secteurs d''activité : retient le secteur NAF (section ou '
  'division) d''un secteur Bubble, ou aucun (code vide), et l''applique '
  'aussitôt aux fiches. Administration seulement.';

revoke all on function public.regler_un_secteur_bubble(text, text, text) from public, anon;
grant execute on function public.regler_un_secteur_bubble(text, text, text) to authenticated, service_role;

-- 6. La fiche : la ligne grise dit aussi le secteur ROME ----------------------
-- La ligne « Repris de Bubble : « … » » du bloc « Sa recherche » (0092,
-- décision 14) montrait le seul texte libre. Une fiche qui portait un secteur
-- de la liste ROME n'en montrait rien : le référent confirmait un secteur
-- repris sans voir ce que Bubble disait. Elle montre désormais le texte libre,
-- sinon l'intitulé ROME (décision 38 du 13 novembre 2026). Le reste est
-- inchangé : affichée tant qu'un secteur reste à confirmer, puis retirée.
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
  select coalesce(nullif(btrim(c.secteur_activite_libelle), ''),
                  public.intitule_bubble(nullif(btrim(c.secteur_activite_rome_bubble_id), '')))
    into texte
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
  'et ce que Bubble portait (le texte libre, sinon l''intitulé ROME) tant '
  'qu''ils ne sont pas tous confirmés. Null pour qui ne lit pas la fiche.';

revoke all on function public.secteurs_du_candidat(uuid) from public, anon;
grant execute on function public.secteurs_du_candidat(uuid) to authenticated, service_role;
