-- ---------------------------------------------------------------------------
-- 0096 — les provinces, tenues par l'administration
--
-- Ce que ça change : la table s'appelle `provinces`, ses deux champs
-- `nom_de_la_province` et `ecusson_provincial` (le renommage s'écrit dans
-- 0080, à la naissance de la table : voir son en-tête). Et l'écran Province
-- n'est plus seulement une liste à regarder : l'administration y ajoute une
-- province, la renomme, dépose son écusson, la retire. Les référents
-- continuent de voir les cartes, sans aucun geste. Décisions du 13 novembre
-- 2026 :
--
--   * l'administration seule modifie ; les référents consultent ;
--   * HERACLES fait foi, Bubble n'apporte que ce qui manque — jusqu'à la
--     bascule, la reprise se rejoue à chaque mise en ligne, et elle ne doit
--     plus défaire ce que l'administration a corrigé ;
--   * retirer une province qui regroupe encore des loges est permis, après une
--     confirmation qui dit combien ; ces loges n'ont alors plus de province.
--
-- CE QUE LA REPRISE FAIT DÉSORMAIS — et ne fait plus
--
-- Le même contrat que les loges du réseau (0094) :
--   * une province absente est créée ;
--   * une province présente n'est que complétée : un nom ou une adresse
--     d'écusson encore vides sont remplis, rien de ce qu'on sait n'est
--     remplacé. Un écusson changé chez Bubble ne remplace plus le nôtre ;
--   * une province retirée par l'administration ne revient pas : chaque
--     province Bubble prise une fois est notée (`provinces_bubble`) ;
--   * une province saisie à la main sous le même nom que celle de Bubble lui
--     est rattachée, au lieu d'être doublée.
--
-- L'ÉCUSSON
--
-- Le fichier est déposé dans le seau par la route web, sous un chemin qu'elle
-- déduit de la province — `provinces/ecusson/<id>.<format>`, le format lu
-- dans les octets. La contrainte ci-dessous l'impose : la route qui sert
-- l'écusson lit le seau avec la clé de service, et un chemin libre lui
-- ferait servir n'importe quel fichier. Les écussons déjà rapatriés sous
-- l'ancien rangement (`province/image/<bubble_id>/<fichier>`) restent
-- valables là où ils sont.
--
-- Accès : la table reste fermée en écriture. Les quatre gestes passent par
-- des fonctions qui vérifient d'abord que la personne est administrateur —
-- comme les loges du réseau (0091). La lecture ne change pas (0080).
-- ---------------------------------------------------------------------------

-- 1. La mémoire de la reprise -------------------------------------------------
-- Chaque province Bubble prise une fois. Une province que l'administration
-- retire n'a plus de ligne dans `provinces`, mais garde la sienne ici : la
-- reprise suivante ne la recrée pas.
create table if not exists public.provinces_bubble (
  bubble_id   text primary key check (btrim(bubble_id) <> ''),
  reprise_le  timestamptz not null default now()
);

comment on table public.provinces_bubble is
  'Les provinces Bubble déjà reprises : une province retirée par '
  'l''administration n''est pas recréée par la reprise suivante.';

-- Fermée : ni policy, ni droit. Seuls la reprise et les fonctions ci-dessous
-- (propriétaire) y écrivent.
alter table public.provinces_bubble enable row level security;
revoke all on public.provinces_bubble from anon, authenticated;

-- Les provinces déjà reprises avant cette migration n'ont pas été notées :
-- sans cette ligne, en retirer une la ferait revenir à la mise en ligne
-- suivante. Rejouable : on ne note que ce qui manque.
insert into public.provinces_bubble (bubble_id)
select p.bubble_id from public.provinces p
 where p.bubble_id is not null and btrim(p.bubble_id) <> ''
on conflict do nothing;

-- 2. Le chemin de l'écusson ----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'provinces_ecusson_provincial_chemin'
       and conrelid = 'public.provinces'::regclass
  ) then
    alter table public.provinces add constraint provinces_ecusson_provincial_chemin
      check (ecusson_provincial is null
             or ecusson_provincial ~ ('^provinces/ecusson/' || id::text || '\.(jpg|png|webp|gif|avif)$')
             -- L'ancien rangement du rapatriement (0080), avant cette migration.
             or ecusson_provincial ~ '^province/image/[^/]+/[^/]+$');
  end if;
end
$$;

-- 3. La reprise : HERACLES fait foi --------------------------------------------
-- Même signature qu'en 0080 et 0081 : le serveur rejoue toutes les migrations,
-- et `create or replace` refuse de changer le type de retour d'une fonction
-- (l'incident du 7 août 2026). Les colonnes gardent leur nom ; `deversees`
-- compte désormais les provinces créées, rattachées ou complétées.
create or replace function public.deverser_provinces_bubble()
returns table (
  /** Provinces écrites — créées, rattachées ou complétées. */
  deversees        bigint,
  /** Parmi elles, celles qui n'y étaient pas. */
  creees           bigint,
  /** Provinces reprises dont aucun champ n'a été reconnu comme le nom. */
  sans_nom         bigint,
  /** Provinces reprises dont aucun champ n'a été reconnu comme l'image. */
  sans_image       bigint,
  /** Loges rattachées à une province, en tout. */
  loges_rattachees bigint,
  /** Loges qui désignent une province que la reprise n'a pas apportée. */
  loges_orphelines bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  b         record;
  trouvee   uuid;
  rattachee boolean;
  touchees  integer;
  ecrites   bigint := 0;
  neuves    bigint := 0;
begin
  for b in
    with brut as (
      select x.donnees as d
        from public.bubble_brut x
       -- `provinces` est le vrai nom (0081) ; `province` reste lu, au cas où.
       where lower(x.type_bubble) in ('provinces', 'province')
         and nullif(btrim(x.donnees->>'_id'), '') is not null
    )
    select
      btrim(brut.d->>'_id') as bubble_id,
      -- Le nom et l'écusson se reconnaissent à leur forme : voir 0080 et 0081.
      (select nullif(btrim(e.value), '')
         from jsonb_each_text(brut.d) e
        where e.key ~* '^[[:space:]]*(nom|name)'
          and jsonb_typeof(brut.d -> e.key) = 'string'
        order by length(e.key), e.key
        limit 1) as nom,
      (select btrim(e.value)
         from jsonb_each_text(brut.d) e
        where jsonb_typeof(brut.d -> e.key) = 'string'
          and btrim(e.value) ~* '^(https?:)?//[^[:space:]]+(\.bubble\.io/|/appforest_uf/)'
        order by (e.key ~* '(ecusson|écusson|image|img|logo|blason|photo|visuel|icone)') desc, e.key
        limit 1) as ecusson_url,
      nullif(btrim(brut.d->>'Created By'), '') as cree_par,
      (brut.d->>'Created Date')::timestamptz  as cree,
      (brut.d->>'Modified Date')::timestamptz as maj
      from brut
     order by 1
  loop
    rattachee := false;
    select p.id into trouvee from public.provinces p where p.bubble_id = b.bubble_id;

    if trouvee is null then
      -- Retirée par l'administration : elle ne revient pas.
      if exists (select 1 from public.provinces_bubble m where m.bubble_id = b.bubble_id) then
        continue;
      end if;
      -- Déjà saisie à la main, sous le même nom : on la rattache.
      if b.nom is not null then
        select p.id into trouvee
          from public.provinces p
         where p.bubble_id is null
           and lower(btrim(p.nom_de_la_province)) = lower(b.nom)
         order by p.cree_le, p.id
         limit 1;
        if trouvee is not null then
          update public.provinces set bubble_id = b.bubble_id where id = trouvee;
          rattachee := true;
        end if;
      end if;
    end if;

    if trouvee is null then
      insert into public.provinces
        (bubble_id, nom_de_la_province, ecusson_provincial_url, cree_par_bubble_id, cree_le, maj_le)
      values
        (b.bubble_id, b.nom, b.ecusson_url, b.cree_par, coalesce(b.cree, now()), coalesce(b.maj, now()));
      neuves  := neuves + 1;
      ecrites := ecrites + 1;
    else
      -- Ce que HERACLES sait reste : on ne remplit que le vide. L'écusson
      -- déposé ou rapatrié (`ecusson_provincial`) n'est jamais touché ici.
      update public.provinces p
         set nom_de_la_province     = coalesce(p.nom_de_la_province, b.nom),
             ecusson_provincial_url = coalesce(p.ecusson_provincial_url, b.ecusson_url),
             cree_par_bubble_id     = coalesce(p.cree_par_bubble_id, b.cree_par)
       where p.id = trouvee
         and ((p.nom_de_la_province is null and b.nom is not null)
              or (p.ecusson_provincial_url is null and b.ecusson_url is not null)
              or (p.cree_par_bubble_id is null and b.cree_par is not null));
      get diagnostics touchees = row_count;
      if rattachee or touchees > 0 then
        ecrites := ecrites + 1;
      end if;
    end if;

    insert into public.provinces_bubble (bubble_id) values (b.bubble_id) on conflict do nothing;
  end loop;

  -- Les loges rejoignent leur province. Seules celles dont le lien change sont
  -- écrites : rejouer ne touche rien. Une province retirée n'a plus de ligne :
  -- ses loges restent sans province.
  update public.loge l
     set province_id = p.id
    from public.provinces p
   where p.bubble_id = l.province_bubble_id
     and l.province_id is distinct from p.id;

  return query
    select
      ecrites,
      neuves,
      (select count(*) from public.provinces where bubble_id is not null and nom_de_la_province is null),
      (select count(*) from public.provinces where bubble_id is not null and ecusson_provincial_url is null),
      (select count(*) from public.loge where province_id is not null),
      (select count(*) from public.loge
        where province_bubble_id is not null and province_id is null);
end
$$;

comment on function public.deverser_provinces_bubble() is
  'Déplie les provinces Bubble (type `provinces`) de `bubble_brut` dans '
  '`provinces`, puis rattache les loges. HERACLES fait foi : crée ce qui '
  'manque, ne remplit que le vide, ne recrée pas une province retirée. '
  'Rejouable. Réservée à l''exploitation.';

revoke all on function public.deverser_provinces_bubble() from public, anon, authenticated;
grant execute on function public.deverser_provinces_bubble() to service_role;

-- 4. Les gestes de l'administration --------------------------------------------

-- La liste que l'administration gère : chaque province, si elle a un écusson,
-- et combien de loges et de loges du réseau s'y rattachent — ce que la
-- confirmation du retrait annonce. Les référents lisent la table (0080) : ils
-- n'ont pas besoin de ces comptes, ils ne les ont pas.
create or replace function public.provinces_a_gerer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Les provinces se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',                 p.id,
             'nom_de_la_province', p.nom_de_la_province,
             'a_un_ecusson',       p.ecusson_provincial is not null,
             -- Change avec l'écusson : l'écran en fait l'adresse de l'image, que
             -- le cache du navigateur ne confond pas avec l'ancienne.
             'maj_le',             p.maj_le,
             'loges',              (select count(*) from public.loge l where l.province_id = p.id),
             'loges_du_reseau',    (select count(*) from public.loge_du_reseau d where d.province_id = p.id))
           order by lower(p.nom_de_la_province) nulls last, p.id)
      from public.provinces p), '[]'::jsonb);
end
$$;

comment on function public.provinces_a_gerer() is
  'Les provinces, leur écusson et le nombre de loges qui s''y rattachent. '
  'Réservée à l''administration.';

revoke all on function public.provinces_a_gerer() from public, anon;
grant execute on function public.provinces_a_gerer() to authenticated, service_role;

-- Ajouter (la_province vide) ou renommer une province. Le nom est nettoyé —
-- espaces autour retirés, espaces répétés réduits à un — puis vérifié : non
-- vide, 120 caractères au plus, et porté par aucune autre province, casse
-- comprise. Deux provinces homonymes ne se distingueraient plus dans la liste
-- des loges du réseau, et la reprise (0094) en choisirait une au hasard.
create or replace function public.enregistrer_province(la_province uuid, le_nom text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  propre text := btrim(regexp_replace(coalesce(le_nom, ''), '[[:space:]]+', ' ', 'g'));
  cible  uuid;
begin
  if not public.est_admin() then
    raise exception 'Les provinces se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  if propre = '' then
    raise exception 'Le nom de la province est obligatoire' using errcode = 'check_violation';
  end if;
  if char_length(propre) > 120 then
    raise exception 'Ce nom de province est trop long' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.provinces p
              where lower(btrim(p.nom_de_la_province)) = lower(propre)
                and p.id is distinct from la_province) then
    raise exception 'Une autre province porte déjà ce nom' using errcode = 'unique_violation';
  end if;

  if la_province is null then
    insert into public.provinces (nom_de_la_province) values (propre) returning id into cible;
  else
    update public.provinces
       set nom_de_la_province = propre,
           maj_le             = now()
     where id = la_province
    returning id into cible;
    if cible is null then
      raise exception 'Cette province n''existe plus' using errcode = 'no_data_found';
    end if;
  end if;
  return cible;
end
$$;

comment on function public.enregistrer_province(uuid, text) is
  'Ajoute (la_province vide) ou renomme une province. Nom obligatoire, '
  'unique, 120 caractères au plus. Réservée à l''administration.';

revoke all on function public.enregistrer_province(uuid, text) from public, anon;
grant execute on function public.enregistrer_province(uuid, text) to authenticated, service_role;

-- Poser l'écusson. Le fichier est déposé dans le seau par la route web ; la
-- base garde son chemin, que la contrainte de la section 2 oblige à se déduire
-- de la province. Rend l'ancien chemin, pour que la route efface l'ancien
-- fichier s'il portait un autre nom.
create or replace function public.poser_l_ecusson_provincial(la_province uuid, chemin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ancien text;
  trouve boolean;
begin
  if not public.est_admin() then
    raise exception 'Les écussons se déposent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  select p.ecusson_provincial, true into ancien, trouve
    from public.provinces p where p.id = la_province for update;
  if not coalesce(trouve, false) then
    raise exception 'Cette province n''existe plus' using errcode = 'no_data_found';
  end if;
  update public.provinces
     set ecusson_provincial = chemin,
         maj_le             = now()
   where id = la_province;
  return ancien;
end
$$;

comment on function public.poser_l_ecusson_provincial(uuid, text) is
  'Range le chemin de l''écusson déposé par l''administration ; rend l''ancien.';

revoke all on function public.poser_l_ecusson_provincial(uuid, text) from public, anon;
grant execute on function public.poser_l_ecusson_provincial(uuid, text) to authenticated, service_role;

-- Retirer une province. Les loges et les loges du réseau qui s'y rattachaient
-- n'ont plus de province (`on delete set null`, 0080 et 0089) : l'écran l'a
-- annoncé, chiffres à l'appui, avant de demander. Une province venue de
-- Bubble reste notée dans la mémoire de la reprise : elle ne revient pas.
-- Rend le chemin de l'écusson, que la route efface du seau — SQL n'atteint
-- pas le stockage.
create or replace function public.retirer_province(la_province uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ecusson text;
  origine text;
  trouve  boolean;
begin
  if not public.est_admin() then
    raise exception 'Les provinces se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.provinces where id = la_province
  returning ecusson_provincial, bubble_id, true into ecusson, origine, trouve;
  if not coalesce(trouve, false) then
    raise exception 'Cette province n''existe plus' using errcode = 'no_data_found';
  end if;
  if origine is not null and btrim(origine) <> '' then
    insert into public.provinces_bubble (bubble_id) values (origine) on conflict do nothing;
  end if;
  return ecusson;
end
$$;

comment on function public.retirer_province(uuid) is
  'Retire une province ; ses loges n''ont plus de province. Une province '
  'venue de Bubble n''est pas recréée par la reprise. Réservée à '
  'l''administration.';

revoke all on function public.retirer_province(uuid) from public, anon;
grant execute on function public.retirer_province(uuid) to authenticated, service_role;
