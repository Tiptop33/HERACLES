-- ---------------------------------------------------------------------------
-- 0114 — les offres saisies à la main
--
-- Ce que ça change : sur l'écran « Offres externes » (route
-- /espace/france-travail), un référent ou l'administrateur saisit une offre
-- d'emploi, de stage ou de stage en alternance trouvée ailleurs qu'à France
-- Travail. Elle rejoint la liste des offres en cours, répond aux mêmes
-- recherches et filtres, et paraît sur la page des candidats de son secteur.
-- Décisions du 27 novembre 2026 : docs/maquettes/saisie-d-une-offre-propositions-notes.md.
--
-- Le modèle :
--   · l'offre saisie est une ligne de `offre_emploi`, comme les autres :
--     `origine = 'saisie'`, un `type_offre` (emploi, stage, alternance), et
--     trois colonnes à elle — `duree_contrat`, `contact`. Le reste réutilise
--     les colonnes existantes : intitulé, entreprise, lieu, contrat,
--     description, lien (`url_origine`), secteur (`code_naf`) ;
--   · qui l'a saisie vit dans une table à part, `offre_saisie`, fermée : la
--     table des offres est lisible de toute personne connectée — candidats
--     compris —, et le nom d'un référent n'a rien à y faire ;
--   · le secteur est obligatoire : la page d'un candidat trie les offres par
--     secteur. C'est une section (« F ») ou une division (« 43 »), comme sur la
--     fiche d'un candidat. `section_naf_d_une_offre` apprend donc à lire une
--     section seule, et une offre rangée dans une section parvient aussi aux
--     candidats qui cherchent dans l'une de ses divisions.
--
-- La durée de vie : trente jours, prolongeables. « En cours » garde son sens —
-- actualisée depuis moins de trente jours (0011, 0097) — et « Prolonger »
-- remet la date d'actualisation à maintenant. Au-delà, l'offre sort de la
-- liste mais n'est pas effacée : la purge des soixante jours (0101) l'épargne,
-- et `offres_saisies_echues` la rend à ceux qui peuvent la prolonger.
--
-- Les droits : saisir, référent ou administrateur ; modifier, prolonger,
-- retirer, son auteur ou l'administrateur. Tout passe par des fonctions qui
-- contrôlent d'abord, puis écrivent : aucune policy d'écriture n'est ouverte
-- sur `offre_emploi`. Une offre de France Travail ne se modifie jamais ici.
--
-- Rejouable : colonnes `if not exists`, contraintes retirées puis reposées,
-- `create or replace` sans changement de type de retour.
-- ---------------------------------------------------------------------------

-- 1. Les colonnes ---------------------------------------------------------------

alter table public.offre_emploi
  add column if not exists origine       text not null default 'france_travail',
  add column if not exists type_offre    text,
  add column if not exists duree_contrat text,
  add column if not exists contact       text;

comment on column public.offre_emploi.origine is
  'D''où vient l''offre : « france_travail » (reçue, ou reprise de Bubble) ou « saisie » (à la main, 0114).';
comment on column public.offre_emploi.type_offre is
  'Offre saisie : emploi, stage ou alternance (« Stage en alternance »). Vide pour France Travail.';
comment on column public.offre_emploi.duree_contrat is
  'Offre saisie : la durée, en texte libre (« 6 mois »).';
comment on column public.offre_emploi.contact is
  'Offre saisie : la personne à joindre pour postuler. Donnée personnelle d''un tiers, '
  'visible des référents et des candidats (registre des traitements).';

alter table public.offre_emploi drop constraint if exists offre_emploi_origine;
alter table public.offre_emploi add constraint offre_emploi_origine
  check (origine in ('france_travail', 'saisie'));

alter table public.offre_emploi drop constraint if exists offre_emploi_type_offre;
alter table public.offre_emploi add constraint offre_emploi_type_offre
  check (type_offre in ('emploi', 'stage', 'alternance'));

-- Une offre saisie a toujours un type ; une offre de France Travail jamais.
alter table public.offre_emploi drop constraint if exists offre_emploi_saisie_typee;
alter table public.offre_emploi add constraint offre_emploi_saisie_typee
  check ((origine = 'saisie') = (type_offre is not null));

create index if not exists offre_emploi_saisie_idx
  on public.offre_emploi (origine) where origine = 'saisie';

-- 2. Qui l'a saisie -------------------------------------------------------------

-- Fermée : RLS sans policy, aucun droit à `authenticated`. Seules les
-- fonctions ci-dessous la lisent. Le compte effacé (0113) laisse l'offre :
-- l'administrateur la reprend.
create table if not exists public.offre_saisie (
  offre_id   uuid primary key references public.offre_emploi (id) on delete cascade,
  saisie_par uuid references public.profil (id) on delete set null,
  saisie_le  timestamptz not null default now()
);

alter table public.offre_saisie enable row level security;
revoke all on public.offre_saisie from public, anon, authenticated;
grant all on public.offre_saisie to service_role;

create index if not exists offre_saisie_par_idx on public.offre_saisie (saisie_par);

comment on table public.offre_saisie is
  'L''auteur d''une offre saisie à la main (0114). Fermée : lue par les seules fonctions des offres saisies.';

-- 3. Le secteur d'une offre : une section se lit aussi ---------------------------

-- « 43.21A », « 4321A », « 43 » → « F », comme en 0097 ; et désormais « F » → « F » :
-- une offre saisie peut être rangée dans un grand secteur entier.
create or replace function public.section_naf_d_une_offre(le_code_naf text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when upper(btrim(coalesce(le_code_naf, ''))) ~ '^[A-U]$'
             then upper(btrim(le_code_naf))
           else (select n.parent
                   from public.code_naf n
                  where n.niveau = 'division'
                    and n.code = left(regexp_replace(coalesce(le_code_naf, ''), '[^0-9A-Za-z]', '', 'g'), 2))
         end
$$;

revoke all on function public.section_naf_d_une_offre(text) from public, anon, authenticated;

-- 4. Lire et contrôler ce qui est saisi -----------------------------------------

-- Les champs envoyés par l'écran, contrôlés et mis en forme. Lève une erreur
-- `check_violation` au message lisible au premier champ qui ne va pas : l'écran
-- contrôle déjà, la base ne fait pas confiance à l'écran.
create or replace function public.offre_saisie_controlee(les_champs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  le_type     text := nullif(btrim(coalesce(les_champs->>'type_offre', '')), '');
  intitule    text := nullif(btrim(regexp_replace(coalesce(les_champs->>'intitule', ''), '\s+', ' ', 'g')), '');
  entreprise  text := nullif(btrim(regexp_replace(coalesce(les_champs->>'entreprise', ''), '\s+', ' ', 'g')), '');
  code_postal text := regexp_replace(coalesce(les_champs->>'code_postal', ''), '\s', '', 'g');
  ville       text := nullif(btrim(regexp_replace(coalesce(les_champs->>'ville', ''), '\s+', ' ', 'g')), '');
  contrat     text := nullif(btrim(coalesce(les_champs->>'contrat', '')), '');
  duree       text := nullif(btrim(regexp_replace(coalesce(les_champs->>'duree', ''), '\s+', ' ', 'g')), '');
  secteur     text := upper(nullif(btrim(coalesce(les_champs->>'secteur', '')), ''));
  description text := nullif(btrim(coalesce(les_champs->>'description', '')), '');
  lien        text := nullif(btrim(coalesce(les_champs->>'lien', '')), '');
  contact     text := nullif(btrim(regexp_replace(coalesce(les_champs->>'contact', ''), '\s+', ' ', 'g')), '');
  secteur_lu  public.code_naf%rowtype;
begin
  if le_type is null or le_type not in ('emploi', 'stage', 'alternance') then
    raise exception 'Choisissez le type d''offre : emploi, stage ou stage en alternance.'
      using errcode = 'check_violation';
  end if;
  if intitule is null or char_length(intitule) > 200 then
    raise exception 'L''intitulé du poste est requis (200 caractères au plus).'
      using errcode = 'check_violation';
  end if;
  if entreprise is null or char_length(entreprise) > 200 then
    raise exception 'Le nom de l''entreprise est requis (200 caractères au plus).'
      using errcode = 'check_violation';
  end if;
  if code_postal !~ '^[0-9]{5}$' then
    raise exception 'Le code postal compte cinq chiffres.'
      using errcode = 'check_violation';
  end if;
  if ville is null or char_length(ville) > 100 then
    raise exception 'La ville est requise (100 caractères au plus).'
      using errcode = 'check_violation';
  end if;
  -- Le contrat ne se dit que d'un emploi : un stage est un stage.
  if contrat is not null and (le_type <> 'emploi' or contrat not in ('CDI', 'CDD', 'Intérim')) then
    raise exception 'Le contrat est CDI, CDD ou Intérim, et seulement pour un emploi.'
      using errcode = 'check_violation';
  end if;
  if char_length(coalesce(duree, '')) > 60 then
    raise exception 'La durée tient en 60 caractères.' using errcode = 'check_violation';
  end if;
  select * into secteur_lu from public.code_naf n
   where n.code = secteur and n.niveau in ('section', 'division');
  if secteur_lu.code is null then
    raise exception 'Choisissez le secteur d''activité de l''offre.'
      using errcode = 'check_violation';
  end if;
  if char_length(coalesce(description, '')) > 10000 then
    raise exception 'La description tient en 10 000 caractères.' using errcode = 'check_violation';
  end if;
  if lien is not null and (lien !~* '^https?://[^\s]+$' or char_length(lien) > 2000) then
    raise exception 'Le lien de l''annonce commence par https:// ou http://.'
      using errcode = 'check_violation';
  end if;
  if char_length(coalesce(contact, '')) > 300 then
    raise exception 'Le contact tient en 300 caractères.' using errcode = 'check_violation';
  end if;

  return jsonb_build_object(
    'type_offre', le_type, 'intitule', intitule, 'entreprise', entreprise,
    'code_postal', code_postal, 'ville', ville,
    'departement', public.departement_d_une_offre(null, code_postal, null, null),
    -- Le contrat n'a de sens que pour un emploi ; la durée, sauf pour un CDI.
    'contrat', contrat,
    'duree', case when contrat = 'CDI' then null else duree end,
    'secteur', secteur_lu.code, 'secteur_libelle', secteur_lu.intitule,
    'description', description, 'lien', lien, 'contact', contact);
end
$$;

revoke all on function public.offre_saisie_controlee(jsonb) from public, anon, authenticated;

-- La personne connectée peut-elle modifier, prolonger, retirer cette offre ?
-- Une offre saisie seulement ; son auteur, ou l'administrateur ; et toujours un
-- référent ou un administrateur — un compte passé chercheur ne garde rien.
create or replace function public.je_peux_modifier_l_offre(l_offre uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_referent_ou_admin()
     and exists (select 1 from public.offre_emploi o where o.id = l_offre and o.origine = 'saisie')
     and (public.est_admin()
          or exists (select 1 from public.offre_saisie s
                      where s.offre_id = l_offre and s.saisie_par = auth.uid()))
$$;

-- Appelée par les seules fonctions ci-dessous.
revoke all on function public.je_peux_modifier_l_offre(uuid) from public, anon, authenticated;

-- 5. Saisir, modifier, prolonger, retirer ---------------------------------------

create or replace function public.saisir_une_offre(les_champs jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c        jsonb;
  nouvelle uuid;
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Seuls les référents saisissent une offre'
      using errcode = 'insufficient_privilege';
  end if;
  c := public.offre_saisie_controlee(les_champs);

  insert into public.offre_emploi (
    origine, type_offre, intitule, entreprise_nom, lieu_code_postal, lieu_libelle, departement,
    type_contrat_libelle, duree_contrat, code_naf, secteur_libelle, description, url_origine,
    contact, date_creation, date_actualisation)
  values (
    'saisie', c->>'type_offre', c->>'intitule', c->>'entreprise', c->>'code_postal', c->>'ville',
    c->>'departement', c->>'contrat', c->>'duree', c->>'secteur', c->>'secteur_libelle',
    c->>'description', c->>'lien', c->>'contact', now(), now())
  returning id into nouvelle;

  insert into public.offre_saisie (offre_id, saisie_par) values (nouvelle, auth.uid());
  return nouvelle;
end
$$;

create or replace function public.modifier_une_offre(l_offre uuid, les_champs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
begin
  if not public.je_peux_modifier_l_offre(l_offre) then
    raise exception 'Cette offre ne se modifie pas ici'
      using errcode = 'insufficient_privilege';
  end if;
  c := public.offre_saisie_controlee(les_champs);

  -- Les dates ne bougent pas : corriger une faute ne prolonge pas l'offre.
  update public.offre_emploi
     set type_offre           = c->>'type_offre',
         intitule             = c->>'intitule',
         entreprise_nom       = c->>'entreprise',
         lieu_code_postal     = c->>'code_postal',
         lieu_libelle         = c->>'ville',
         departement          = c->>'departement',
         type_contrat_libelle = c->>'contrat',
         duree_contrat        = c->>'duree',
         code_naf             = c->>'secteur',
         secteur_libelle      = c->>'secteur_libelle',
         description          = c->>'description',
         url_origine          = c->>'lien',
         contact              = c->>'contact'
   where id = l_offre and origine = 'saisie';
end
$$;

-- Trente jours de plus, à compter d'aujourd'hui. Rend la nouvelle fin.
create or replace function public.prolonger_une_offre(l_offre uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.je_peux_modifier_l_offre(l_offre) then
    raise exception 'Cette offre ne se prolonge pas ici'
      using errcode = 'insufficient_privilege';
  end if;
  update public.offre_emploi set date_actualisation = now()
   where id = l_offre and origine = 'saisie';
  return now() + interval '30 days';
end
$$;

-- Retirer, c'est supprimer : l'offre n'est plus à pourvoir. Son auteur part avec.
create or replace function public.retirer_une_offre(l_offre uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.je_peux_modifier_l_offre(l_offre) then
    raise exception 'Cette offre ne se retire pas ici'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.offre_emploi where id = l_offre and origine = 'saisie';
end
$$;

revoke all on function public.saisir_une_offre(jsonb) from public, anon;
revoke all on function public.modifier_une_offre(uuid, jsonb) from public, anon;
revoke all on function public.prolonger_une_offre(uuid) from public, anon;
revoke all on function public.retirer_une_offre(uuid) from public, anon;
grant execute on function public.saisir_une_offre(jsonb) to authenticated;
grant execute on function public.modifier_une_offre(uuid, jsonb) to authenticated;
grant execute on function public.prolonger_une_offre(uuid) to authenticated;
grant execute on function public.retirer_une_offre(uuid) to authenticated;

-- 6. Ce que la fenêtre de modification lit -------------------------------------

-- L'offre telle que la fenêtre la remplit, avec son secteur tel que le choix
-- des secteurs l'affiche, et la fin de sa mise en ligne. `null` quand la
-- personne connectée ne peut pas la modifier : l'écran n'affiche alors aucun
-- geste.
create or replace function public.offre_a_modifier(l_offre uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
begin
  if not public.je_peux_modifier_l_offre(l_offre) then
    return null;
  end if;

  select jsonb_build_object(
           'id', o.id,
           'type_offre', o.type_offre,
           'intitule', o.intitule,
           'entreprise', o.entreprise_nom,
           'code_postal', o.lieu_code_postal,
           'ville', o.lieu_libelle,
           'contrat', o.type_contrat_libelle,
           'duree', o.duree_contrat,
           'description', o.description,
           'lien', o.url_origine,
           'contact', o.contact,
           'secteur', case when n.code is null then null else jsonb_build_object(
                        'code', n.code, 'intitule', n.intitule, 'niveau', n.niveau,
                        'section', coalesce(s.code, n.code),
                        'section_intitule', coalesce(s.intitule, n.intitule)) end,
           'en_ligne_jusqu_au', coalesce(o.date_actualisation, o.date_creation) + interval '30 days')
    into resultat
    from public.offre_emploi o
    left join public.code_naf n on n.code = o.code_naf and n.niveau in ('section', 'division')
    left join public.code_naf s on s.code = n.parent and s.niveau = 'section'
   where o.id = l_offre;

  return resultat;
end
$$;

revoke all on function public.offre_a_modifier(uuid) from public, anon;
grant execute on function public.offre_a_modifier(uuid) to authenticated;

-- 7. Les offres saisies sorties de la liste ---------------------------------------

-- Celles qui ont passé leurs trente jours : l'administrateur les voit toutes,
-- un référent les siennes. Les plus récemment sorties d'abord ; cent au plus.
create or replace function public.offres_saisies_echues()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
  admin    boolean := public.est_admin();
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'intitule', x.intitule, 'entreprise_nom', x.entreprise_nom,
           'lieu_libelle', x.lieu_libelle, 'type_contrat_libelle', x.type_contrat_libelle,
           'type_offre', x.type_offre, 'date_creation', x.date_creation)
         order by x.quand desc, x.id), '[]'::jsonb)
    into resultat
    from (select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
                 o.type_offre, o.date_creation,
                 coalesce(o.date_actualisation, o.date_creation) as quand
            from public.offre_emploi o
            left join public.offre_saisie s on s.offre_id = o.id
           where o.origine = 'saisie'
             and coalesce(o.date_actualisation, o.date_creation) <= now() - interval '30 days'
             and (admin or s.saisie_par = auth.uid())
           order by quand desc, o.id
           limit 100) x;

  return resultat;
end
$$;

revoke all on function public.offres_saisies_echues() from public, anon;
grant execute on function public.offres_saisies_echues() to authenticated;

-- 8. La liste des offres en cours porte le type ----------------------------------

-- Même fonction qu'en 0102, avec `type_offre` en plus : l'étiquette de la ligne.
create or replace function public.offres_en_cours(
  les_departements text[]  default null,
  le_secteur       text    default null,
  limite           integer default 50,
  decalage         integer default 0,
  la_recherche     text    default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
  mots     text[] := public.mots_d_une_recherche(la_recherche);
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  with retenues as (
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
           o.type_offre, o.date_creation,
           coalesce(o.date_actualisation, o.date_creation) as quand
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and (coalesce(cardinality(les_departements), 0) = 0
            or public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                           o.lieu_code_insee, o.lieu_libelle)
               = any (les_departements))
       and (nullif(btrim(le_secteur), '') is null
            or public.section_naf_d_une_offre(o.code_naf) = btrim(le_secteur))
       and (cardinality(mots) = 0
            or o.texte_cherche like all (mots))
  ),
  la_page as (
    select r.* from retenues r
     order by r.quand desc, r.id
     limit least(greatest(coalesce(limite, 50), 1), 200)
    offset greatest(coalesce(decalage, 0), 0)
  )
  select jsonb_build_object(
           'total', (select count(*) from retenues),
           'offres', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'intitule', p.intitule, 'entreprise_nom', p.entreprise_nom,
                       'lieu_libelle', p.lieu_libelle,
                       'type_contrat_libelle', p.type_contrat_libelle,
                       'type_offre', p.type_offre,
                       'date_creation', p.date_creation)
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

comment on function public.offres_en_cours(text[], text, integer, integer, text) is
  'Une page des offres en cours de l''écran Offres externes — France Travail et '
  'offres saisies —, filtrées par départements (l''un ou l''autre), par secteur '
  '(section NAF) et par mots (tous, sans accents), avec le total. Chaque offre '
  'porte sa date de parution et, saisie, son type. Réservée aux référents et à '
  'l''administration ; 200 lignes par page au plus.';

revoke all on function public.offres_en_cours(text[], text, integer, integer, text) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer, integer, text)
  to authenticated, service_role;

-- 9. La page du candidat : le type, et les offres rangées dans une section ------

-- Même fonction qu'en 0105, à deux choses près : chaque offre porte son type, et
-- une offre rangée dans un grand secteur parvient aussi au candidat qui cherche
-- dans l'une de ses divisions.
create or replace function public.offres_pour_moi(
  la_recherche text    default null,
  limite       integer default 20,
  decalage     integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dossier  uuid := public.mon_dossier();
  mots     text[] := public.mots_d_une_recherche(la_recherche);
  choisis  text[];
  depuis   timestamptz;
  resultat jsonb;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;

  select case when p.candidat_id is not null and p.departements is not null then p.departements
              else (select array_remove(array[public.departement_d_une_offre(null, c.code_postal, null, null)], null))
         end,
         coalesce(p.visite_precedente_le, now() - interval '3 days')
    into choisis, depuis
    from public.candidat c
    left join public.page_candidat p on p.candidat_id = c.id
   where c.id = dossier;

  with mes_codes as (
    select cs.code from public.candidat_secteur cs where cs.candidat_id = dossier
  ),
  dans_mes_secteurs as (
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
           o.type_offre, o.date_creation,
           coalesce(o.date_actualisation, o.date_creation) as quand,
           public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                          o.lieu_code_insee, o.lieu_libelle) as dep
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and exists (
         select 1 from mes_codes m
          where m.code = left(regexp_replace(coalesce(o.code_naf, ''), '[^0-9A-Za-z]', '', 'g'), 2)
             or m.code = public.section_naf_d_une_offre(o.code_naf)
             -- L'offre est rangée dans une section, le candidat cherche dans
             -- l'une de ses divisions.
             or (o.code_naf ~ '^[A-U]$'
                 and exists (select 1 from public.code_naf d
                              where d.code = m.code and d.niveau = 'division'
                                and d.parent = o.code_naf)))
       and (cardinality(mots) = 0 or o.texte_cherche like all (mots))
  ),
  retenues as (
    select d.* from dans_mes_secteurs d
     where coalesce(cardinality(choisis), 0) = 0 or d.dep = any (choisis)
  ),
  la_page as (
    select r.* from retenues r
     order by r.quand desc, r.id
     limit least(greatest(coalesce(limite, 20), 1), 100)
    offset greatest(coalesce(decalage, 0), 0)
  )
  select jsonb_build_object(
           'total', (select count(*) from retenues),
           'nouvelles', (select count(*) from retenues r where r.date_creation > depuis),
           'choisis', to_jsonb(coalesce(choisis, '{}'::text[])),
           'departements', coalesce(
             (select jsonb_agg(jsonb_build_object('code', x.dep, 'nombre', x.n) order by x.dep)
                from (select d.dep, count(*) as n from dans_mes_secteurs d
                       where d.dep is not null group by d.dep) x),
             '[]'::jsonb),
           'offres', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'intitule', p.intitule, 'entreprise_nom', p.entreprise_nom,
                       'lieu_libelle', p.lieu_libelle,
                       'type_contrat_libelle', p.type_contrat_libelle,
                       'type_offre', p.type_offre,
                       'date_creation', p.date_creation,
                       'nouvelle', coalesce(p.date_creation > depuis, false))
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

revoke all on function public.offres_pour_moi(text, integer, integer) from public, anon;
grant execute on function public.offres_pour_moi(text, integer, integer) to authenticated;

-- 10. La purge épargne les offres saisies ------------------------------------------

-- Même fonction qu'en 0101, à une condition près : une offre saisie n'est
-- jamais effacée par la purge. Sortie de la liste, elle attend qu'on la
-- prolonge ou qu'on la retire.
create or replace function public.purger_les_offres_anciennes(jours integer default 60)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purgees integer;
begin
  if jours is null or jours < 31 then
    raise exception 'La purge ne descend pas sous 31 jours : en dessous, les offres sont encore en cours'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.offre_emploi o
   where o.origine <> 'saisie'
     and coalesce(o.date_actualisation, o.date_creation, o.cree_le)
         < now() - make_interval(days => jours);
  get diagnostics purgees = row_count;

  return purgees;
end
$$;

comment on function public.purger_les_offres_anciennes(integer) is
  'Supprime les offres de France Travail dont la dernière date connue '
  '(actualisation, création, réception) a plus de N jours — 60 par défaut, '
  'jamais moins de 31. Les offres saisies à la main (0114) sont épargnées. '
  'Rend le nombre d''offres supprimées.';
