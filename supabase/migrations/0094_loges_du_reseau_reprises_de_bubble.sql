-- ---------------------------------------------------------------------------
-- 0094 — les loges du réseau, reprises de Bubble
--
-- Ce que ça change : Paramètres › Loges du réseau n'est plus à saisir loge par
-- loge. Les 73 loges du réseau existent déjà dans l'ancienne application : la
-- reprise les y prend — nom, numéro, province, adresse électronique, écusson —
-- et l'administration n'a plus qu'à compléter (le nom du Secrétaire, que
-- Bubble n'a pas) puis à envoyer les liens. Décisions du 13 novembre 2026 :
--
--   39. on reprend les loges que Bubble rattache à la loge HERACLES — 73, une
--       seule province, 73 numéros. Les 6 rattachées à une autre loge de
--       l'application ne sont pas prises ;
--   40. l'adresse de la loge (`EMAIL_LOGES`, 36 loges sur 73) devient
--       l'adresse du Secrétaire : c'est là que partira le lien.
--
-- D'où viennent les données : le type Bubble `loges` — 1 389 loges, toutes
-- celles de l'annuaire —, recopié tel quel dans `bubble_brut` par la reprise
-- (`reprendre-bubble.sh --loges-du-reseau`, depuis la base en service : celle
-- de l'éditeur n'en a que 39 des 73). Le champ `LOGE-LOGEREF` désigne la loge
-- de l'application à laquelle chacune est rattachée. Aucune donnée réelle
-- n'est écrite par cette migration.
--
-- Ce que la reprise ne fait jamais :
--   * remplacer ce que l'administration a saisi — elle ne remplit que le vide ;
--   * recréer une loge que l'administration a retirée — chaque loge Bubble
--     prise une fois est notée (`loge_du_reseau_bubble`), et ne revient pas ;
--   * créer un doublon d'une loge déjà saisie à la main — même numéro : la
--     loge saisie est rattachée à sa loge Bubble, et complétée.
--
-- L'écusson : l'adresse du logo chez Bubble est gardée (`ecusson_url`) ; la
-- reprise télécharge le fichier, le reconnaît à ses octets et le range au
-- chemin de l'écusson (`rapatrier-fichiers.mjs`, SEULEMENT=loges-du-reseau).
-- Une loge qui a déjà son écusson le garde.
--
-- Accès : rien de neuf pour l'application. Les deux colonnes ne sortent par
-- aucune fonction de l'écran ; la table de mémoire est fermée (RLS, aucune
-- policy, aucun droit) ; la fonction de déversement n'est qu'au rôle
-- propriétaire, celui de la reprise.
-- ---------------------------------------------------------------------------

-- 1. Le lien avec Bubble ------------------------------------------------------
alter table public.loge_du_reseau add column if not exists bubble_id text;
alter table public.loge_du_reseau add column if not exists ecusson_url text;

create unique index if not exists loge_du_reseau_bubble_id_unique
  on public.loge_du_reseau (bubble_id) where bubble_id is not null;

comment on column public.loge_du_reseau.bubble_id is
  'L''identifiant de la loge dans Bubble (type `loges`), quand elle vient de la reprise.';
comment on column public.loge_du_reseau.ecusson_url is
  'L''adresse du logo chez Bubble. Le fichier est rapatrié vers `ecusson_chemin` '
  'tant que celui-ci est vide ; l''adresse cessera de répondre à la fermeture de Bubble.';

-- 2. La mémoire de la reprise --------------------------------------------------
-- Chaque loge Bubble prise une fois. Une loge que l'administration retire de
-- la liste n'a plus de ligne dans `loge_du_reseau`, mais garde la sienne ici :
-- la reprise suivante ne la recrée pas.
create table if not exists public.loge_du_reseau_bubble (
  bubble_id   text primary key check (btrim(bubble_id) <> ''),
  reprise_le  timestamptz not null default now()
);

comment on table public.loge_du_reseau_bubble is
  'Les loges Bubble déjà reprises dans les loges du réseau : une loge retirée '
  'par l''administration n''est pas recréée par la reprise suivante.';

alter table public.loge_du_reseau_bubble enable row level security;

-- 3. Le déversement -------------------------------------------------------------
create or replace function public.deverser_loges_du_reseau_bubble(de_la_loge text default 'HERACLES')
returns table (lues integer, creees integer, rattachees integer, completees integer,
               laissees integer, sans_province integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  reference    text;
  b            record;
  trouvee      uuid;
  deja         boolean;
  la_province  uuid;
  l_adresse    text;
  l_ecusson    text;
  touchees     integer;
begin
  lues := 0; creees := 0; rattachees := 0; completees := 0; laissees := 0; sans_province := 0;

  -- La loge de l'application dont on prend le réseau, par son nom.
  select l.bubble_id into reference
    from public.loge l
   where upper(btrim(l.nom)) = upper(btrim(de_la_loge)) and l.bubble_id is not null
   order by l.cree_le
   limit 1;
  if reference is null then
    raise exception 'Aucune loge « % » reprise de Bubble : son réseau est introuvable', de_la_loge
      using errcode = 'no_data_found';
  end if;

  for b in
    select btrim(x.donnees ->> '_id')                                          as bubble_id,
           nullif(btrim(x.donnees ->> 'NOM_LOGES'), '')                         as nom,
           -- Bubble rend parfois un nombre entier écrit « 1310.0 ».
           nullif(regexp_replace(btrim(coalesce(x.donnees ->> 'numero loge', '')), '\.0+$', ''), '') as numero,
           nullif(btrim(x.donnees ->> 'PROVINCE'), '')                          as province,
           lower(nullif(btrim(x.donnees ->> 'EMAIL_LOGES'), ''))                as adresse,
           nullif(btrim(x.donnees ->> 'logo'), '')                              as logo
      from public.bubble_brut x
     where lower(x.type_bubble) = 'loges'
       and btrim(x.donnees ->> 'LOGE-LOGEREF') = reference
       and nullif(btrim(x.donnees ->> '_id'), '') is not null
     order by 3, 1
  loop
    lues := lues + 1;
    if b.nom is null then
      laissees := laissees + 1;
      continue;
    end if;

    -- La province : par son identifiant Bubble, sinon par son nom.
    select p.id into la_province
      from public.provinces p
     where p.bubble_id = b.province
        or lower(btrim(p.nom_de_la_province)) = lower(b.province)
     order by (p.bubble_id = b.province) desc nulls last
     limit 1;
    if la_province is null then
      sans_province := sans_province + 1;
    end if;

    -- Une adresse que la table refuserait ne part pas : elle reste vide.
    l_adresse := case when b.adresse ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then b.adresse end;
    l_ecusson := case when b.logo like '//%' then 'https:' || b.logo
                      when b.logo ~* '^https?://' then b.logo end;

    select id into trouvee from public.loge_du_reseau where bubble_id = b.bubble_id;
    deja := trouvee is not null;

    if not deja then
      -- Retirée par l'administration : elle ne revient pas.
      if exists (select 1 from public.loge_du_reseau_bubble m where m.bubble_id = b.bubble_id) then
        laissees := laissees + 1;
        continue;
      end if;
      -- Déjà saisie à la main, au même numéro : on la rattache.
      if b.numero is not null then
        select id into trouvee
          from public.loge_du_reseau
         where bubble_id is null and lower(btrim(numero)) = lower(b.numero);
      end if;
      if trouvee is not null then
        update public.loge_du_reseau set bubble_id = b.bubble_id where id = trouvee;
        rattachees := rattachees + 1;
      end if;
    end if;

    if trouvee is null then
      -- Un numéro déjà pris par une autre loge reprise : on ne force pas.
      if b.numero is not null
         and exists (select 1 from public.loge_du_reseau where lower(btrim(numero)) = lower(b.numero)) then
        laissees := laissees + 1;
        continue;
      end if;
      insert into public.loge_du_reseau (nom, numero, province_id, secretaire_email, ecusson_url, bubble_id)
      values (b.nom, b.numero, la_province, l_adresse, l_ecusson, b.bubble_id);
      creees := creees + 1;
    else
      -- Ce que l'administration a saisi reste : on ne remplit que le vide.
      update public.loge_du_reseau d
         set province_id      = coalesce(d.province_id, la_province),
             secretaire_email = coalesce(d.secretaire_email, l_adresse),
             ecusson_url      = coalesce(d.ecusson_url, l_ecusson),
             numero           = coalesce(d.numero,
                                  case when b.numero is not null
                                        and not exists (select 1 from public.loge_du_reseau o
                                                         where lower(btrim(o.numero)) = lower(b.numero))
                                       then b.numero end)
       where d.id = trouvee
         and ((d.province_id is null and la_province is not null)
              or (d.secretaire_email is null and l_adresse is not null)
              or (d.ecusson_url is null and l_ecusson is not null)
              or (d.numero is null and b.numero is not null));
      get diagnostics touchees = row_count;
      if deja and touchees > 0 then
        completees := completees + 1;
      end if;
    end if;

    insert into public.loge_du_reseau_bubble (bubble_id) values (b.bubble_id) on conflict do nothing;
  end loop;

  return next;
end
$$;

comment on function public.deverser_loges_du_reseau_bubble(text) is
  'Prend dans `bubble_brut` (type `loges`) les loges du réseau rattachées à une '
  'loge de l''application (HERACLES par défaut) et les pose dans '
  '`loge_du_reseau` : création, rattachement d''une loge saisie au même numéro, '
  'ou complément du vide. Ne remplace rien, ne recrée pas une loge retirée. '
  'Rejouable. Lancée par reprendre-bubble.sh --loges-du-reseau.';

revoke all on function public.deverser_loges_du_reseau_bubble(text) from public, anon, authenticated;
