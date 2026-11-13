-- ---------------------------------------------------------------------------
-- 0081 — les provinces, telles que Bubble les nomme vraiment
--
-- Ce que ça change : la reprise des provinces trouve enfin le type Bubble, et
-- une reprise faite sans jeton ne peut plus effacer ce qu'une reprise
-- précédente avait apporté.
--
-- CE QUE LE RELEVÉ DU 11 NOVEMBRE A APPRIS
--
-- 0080 avait été écrite sans connaître le type, faute de relevé. Le relevé
-- (`/api/1.1/meta`, les deux bases) dit :
--
--   * le type s'appelle `provinces`, au PLURIEL — l'affichage dit « PROVINCES ».
--     0080 ne lisait que `province` : le dépliage n'aurait rien trouvé, et
--     l'aurait dit par un `deversees = 0` qu'on pouvait prendre pour « rien de
--     neuf » ;
--   * ses champs sont `Nom` (texte), `Ecusson` (image), `LOGES-OAF` (la liste
--     des loges), plus les champs système. La détection de 0080 reconnaissait
--     déjà `Nom` ; `Ecusson` passe désormais en tête des clés d'image ;
--   * une règle de confidentialité de Bubble cache les provinces à l'API sans
--     jeton : l'enregistrement répond, mais réduit à son `_id`. La base en
--     service compte deux provinces (désignées par ses trois loges), et la
--     liste anonyme en rend zéro.
--
-- LE PIÈGE QUE CE DERNIER POINT OUVRAIT
--
-- Une reprise lancée sans `BUBBLE_TOKEN` recopie dans `bubble_brut` des
-- provinces vidées de leurs champs, par-dessus les bonnes. Le dépliage de 0080
-- aurait alors écrit `nom = null` et `image_url = null` sur des provinces
-- connues : les cartes perdaient leur nom en silence. Désormais, une valeur
-- absente du côté de Bubble ne remplace pas une valeur connue de notre côté.
--
-- Conséquence assumée : une image réellement retirée dans Bubble resterait
-- ici. D'ici la bascule, c'est le bon sens de l'erreur — une image de trop se
-- voit et se retire, une image perdue après la fermeture ne se retrouve pas.
--
-- `reprendre-bubble.sh --provinces`, lui, refuse de tourner sans jeton.
--
-- Depuis le 13 novembre 2026, la table s'appelle `provinces` et ses champs
-- `nom_de_la_province` et `ecusson_provincial` (voir l'en-tête de 0080) ; et la
-- règle de ce dépliage a changé : HERACLES fait foi (voir 0096).
-- ---------------------------------------------------------------------------

create or replace function public.deverser_provinces_bubble()
returns table (
  /** Provinces écrites — créées ou mises à jour. */
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
  ecrites bigint;
  neuves  bigint;
begin
  with brut as (
    select b.donnees as d
      from public.bubble_brut b
     -- `provinces` est le vrai nom ; `province` reste lu, au cas où.
     where lower(b.type_bubble) in ('provinces', 'province')
       and nullif(btrim(b.donnees->>'_id'), '') is not null
  ),
  lue as (
    select
      btrim(brut.d->>'_id') as bubble_id,
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
        limit 1) as image_url,
      nullif(btrim(brut.d->>'Created By'), '') as cree_par,
      (brut.d->>'Created Date')::timestamptz  as cree,
      (brut.d->>'Modified Date')::timestamptz as maj
      from brut
  ),
  posee as (
    insert into public.provinces as p
      (bubble_id, nom_de_la_province, ecusson_provincial_url, cree_par_bubble_id, cree_le, maj_le)
    select bubble_id, nom, image_url, cree_par, coalesce(cree, now()), coalesce(maj, now())
      from lue
    on conflict (bubble_id) do update set
      -- Ce que Bubble ne dit pas n'efface pas ce qu'on sait : voir l'en-tête.
      nom_de_la_province     = coalesce(excluded.nom_de_la_province, p.nom_de_la_province),
      ecusson_provincial_url = coalesce(excluded.ecusson_provincial_url, p.ecusson_provincial_url),
      ecusson_provincial     = case when excluded.ecusson_provincial_url is not null
                                     and p.ecusson_provincial_url is distinct from excluded.ecusson_provincial_url
                                    then null else p.ecusson_provincial end,
      cree_par_bubble_id = coalesce(excluded.cree_par_bubble_id, p.cree_par_bubble_id),
      -- Une fiche réduite à son `_id` n'a pas de dates : on garde les nôtres.
      cree_le            = case when excluded.nom_de_la_province is null and excluded.ecusson_provincial_url is null
                                then p.cree_le else excluded.cree_le end,
      maj_le             = case when excluded.nom_de_la_province is null and excluded.ecusson_provincial_url is null
                                then p.maj_le else excluded.maj_le end
    returning (xmax = 0) as creee
  )
  select count(*), count(*) filter (where posee.creee)
    into ecrites, neuves
    from posee;

  -- Les loges rejoignent leur province. Seules celles dont le lien change sont
  -- écrites : rejouer ne touche rien.
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
  '`provinces`, puis rattache les loges. Rejouable ; une valeur absente côté '
  'Bubble n''efface pas une valeur connue. Réservée à l''exploitation.';

-- Mêmes droits qu'en 0080 : `create or replace` les garde, on les redit pour
-- qu'ils se lisent ici.
revoke all on function public.deverser_provinces_bubble() from public, anon, authenticated;
grant execute on function public.deverser_provinces_bubble() to service_role;
