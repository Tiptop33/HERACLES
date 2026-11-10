-- ---------------------------------------------------------------------------
-- 0076 — le CV anonyme se valide tout seul, quand rien n'y est suspect
--
-- Ce que ça change : dès qu'un candidat a un **CV original** et un emploi
-- recherché, HERACLES valide lui-même son CV anonyme (0073) — **si rien de
-- suspect n'y apparaît** : ni le nom, ni le prénom, ni l'adresse du candidat,
-- ni son téléphone, ni aucune adresse électronique, aucun numéro de
-- téléphone, aucun lien web. La validation est signée « HERACLES »
-- (`cv_anonyme_valide_auto`). Sinon, le CV reste « à valider » par un
-- référent de la loge, comme avant. Décision du 10 novembre 2026.
--
-- QUAND
--
-- Le déclencheur de 0073 réévalue à chaque création de fiche, et à chaque
-- modification de ce qui compte : un champ imprimé, le CV original, le CV
-- anonyme déposé, l'identité du candidat (nom, prénom, courriel, téléphone,
-- adresse), la clôture ou l'archivage. Une fiche modifiée est donc
-- **revalidée d'elle-même** si elle reste propre ; une validation de HERACLES
-- qui ne l'est plus — un nom ajouté dans « Expériences » — est retirée.
--
-- Les dossiers déjà en base sont validés par cette migration, aux mêmes
-- conditions.
--
-- CE QUI RESTE AUX RÉFÉRENTS
--
--   · valider à la main un CV que HERACLES a jugé suspect, après relecture ;
--   · **retirer** une validation, même de HERACLES : elle ne revient pas
--     d'elle-même (`cv_anonyme_retire_le`) avant la prochaine modification
--     d'un champ imprimé.
--
-- Un dossier qui a déjà un **CV anonyme déposé** (repris de Bubble, ou à la
-- main) n'est pas validé d'office : ce fichier, préparé par la commission,
-- reste celui que sert le lien, tant qu'un référent ne valide pas le CV
-- produit.
--
-- CE QUE LA VÉRIFICATION NE VOIT PAS
--
-- Un nom d'employeur, un surnom, un nom mal orthographié, un nom de moins de
-- deux lettres, un tiers. Elle cherche des mots et des formes, elle ne lit
-- pas. Le registre RGPD (§ 5 bis) le dit.
--
-- LA COPIE FIGÉE (0075)
--
-- La base ne produit pas de PDF : la copie d'une validation de HERACLES est
-- rangée à la première ouverture du CV — par le lien public, ou par un
-- référent de la loge depuis la fiche. Pour qu'une copie ne soit jamais
-- rangée sous une autre validation que celle dont elle a été produite, les
-- deux fonctions qui figent reçoivent l'instant de la validation attendue, et
-- ne figent rien s'il a changé entre-temps.
-- ---------------------------------------------------------------------------

alter table public.candidat
  add column if not exists cv_anonyme_valide_auto boolean not null default false,
  add column if not exists cv_anonyme_retire_le   timestamptz;

comment on column public.candidat.cv_anonyme_valide_auto is
  'Vrai si la validation en cours du CV anonyme a été donnée par HERACLES, '
  'faute de rien de suspect (0076) ; faux si un référent l''a donnée.';
comment on column public.candidat.cv_anonyme_retire_le is
  'Un référent a retiré la validation du CV anonyme : HERACLES ne la redonne '
  'pas avant la prochaine modification d''un champ imprimé (0076).';

-- ---------------------------------------------------------------------------
-- 1. Le texte réduit : sans accents, sans casse, des mots séparés d'un espace
--
-- `translate()` plutôt que l'extension `unaccent` : rien à installer, le même
-- résultat sur PostgreSQL nu (tests) et sous Supabase. Les accents d'abord,
-- la casse ensuite : `lower()` ne descend pas les lettres accentuées sous une
-- collation « C ».
-- ---------------------------------------------------------------------------
create or replace function public.texte_reduit(texte text)
returns text
language sql
immutable
set search_path = public
as $$
  select ' ' || btrim(regexp_replace(
           lower(translate(coalesce(texte, ''),
             'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝŸýÿŒœÆæ',
             'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyyOoAa')),
           '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

comment on function public.texte_reduit(text) is
  'Le texte sans accents ni casse, réduit à des mots séparés d''un espace, '
  'bordé d''un espace : « position('' mot '' in …) » trouve un mot entier.';

-- ---------------------------------------------------------------------------
-- 2. Ce qui est suspect dans le CV anonyme d'une fiche
--
-- Rend `null` si rien, sinon la première raison trouvée — « le nom du
-- candidat, dans « Expériences » ». On cherche dans les seuls champs que le
-- CV imprime (0073).
-- ---------------------------------------------------------------------------
create or replace function public.cv_anonyme_suspect(fiche public.candidat)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  -- Ce qui ne désigne personne : particules et petits mots.
  petits constant text[] := array['de','du','des','la','le','les','d','l','et','en','au','aux',
                                  'un','une','a','y','e','el','al','da','di','do','dos','das',
                                  'van','von','der','den','ben','bin','ibn','mc','st','ste'];
  champs   text[] := array[fiche.emploi_recherche, fiche.secteur_activite_libelle,
                           fiche.metier_libelle, fiche.mobilite_geographique,
                           fiche.experiences, fiche.formations, fiche.competences,
                           fiche.savoir_etre, fiche.informatique];
  noms     constant text[] := array['Emploi recherché', 'Secteur', 'Métier', 'Mobilité',
                                    'Expériences', 'Formations', 'Compétences',
                                    'Savoir-être', 'Informatique'];
  identite text[];
  adresses text[];
  telephone text := right(regexp_replace(coalesce(fiche.telephone, ''), '[^0-9]', '', 'g'), 9);
  brut     text;
  reduit   text;
  chiffres text;
  mot      text;
  i        int;
begin
  -- Les mots du nom et du prénom, chacun ; et le nom entier, s'il en a plusieurs.
  select coalesce(array_agg(distinct m), array[]::text[]) into identite
    from (
      select unnest(regexp_split_to_array(btrim(public.texte_reduit(fiche.nom)), ' ')) as m
      union all
      select unnest(regexp_split_to_array(btrim(public.texte_reduit(fiche.prenom)), ' '))
      union all
      select btrim(public.texte_reduit(fiche.nom))
      union all
      select btrim(public.texte_reduit(fiche.prenom || ' ' || fiche.nom))
    ) t
   where length(m) >= 2 and not (m = any (petits));

  -- L'adresse entière, et sa rue seule (avant la virgule ou le code postal).
  select coalesce(array_agg(distinct a), array[]::text[]) into adresses
    from (
      select btrim(public.texte_reduit(fiche.adresse)) as a
      union all
      select btrim(public.texte_reduit(split_part(fiche.adresse, ',', 1)))
      union all
      select btrim(public.texte_reduit(regexp_replace(coalesce(fiche.adresse, ''), '[0-9]{5}.*$', '')))
    ) t
   where length(a) >= 8;

  for i in 1 .. array_length(champs, 1) loop
    brut := coalesce(champs[i], '');
    continue when btrim(brut) = '';
    reduit := public.texte_reduit(brut);

    foreach mot in array identite loop
      if position(' ' || mot || ' ' in reduit) > 0 then
        return format('le nom ou le prénom du candidat, dans « %s »', noms[i]);
      end if;
    end loop;

    foreach mot in array adresses loop
      if position(' ' || mot || ' ' in reduit) > 0 then
        return format('l''adresse du candidat, dans « %s »', noms[i]);
      end if;
    end loop;

    if brut ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' then
      return format('une adresse électronique, dans « %s »', noms[i]);
    end if;

    if brut ~* '(https?://|www\.|linkedin\.)' then
      return format('un lien web, dans « %s »', noms[i]);
    end if;

    -- Un numéro français — 06 12 34 56 78, 06.12.34.56.78, 0612345678 : le
    -- même séparateur partout, sans quoi « 01.02.2019 - 31.12.2020 » passerait
    -- pour un numéro —, ou un numéro international (+33…, 0049…), jamais
    -- collé à un chiffre : « 2000 2005 2010 » n'en est pas un.
    if brut ~ '(^|[^0-9])0[1-9]([ .-]?)[0-9]{2}(\2[0-9]{2}){3}([^0-9]|$)'
       or brut ~ '(^|[^0-9])(\+|00)[[:space:]]*[1-9][0-9]{0,2}([ .()-]*[0-9]){8,}' then
      return format('un numéro de téléphone, dans « %s »', noms[i]);
    end if;

    -- Le numéro du candidat, quelle que soit la façon de l'écrire.
    if length(telephone) = 9 then
      chiffres := regexp_replace(brut, '([0-9])[[:space:].()-]+(?=[0-9])', '\1', 'g');
      if position(telephone in chiffres) > 0 then
        return format('le téléphone du candidat, dans « %s »', noms[i]);
      end if;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.cv_anonyme_suspect(public.candidat) is
  'Ce qui empêche HERACLES de valider seul le CV anonyme de cette fiche : nom, '
  'prénom, adresse ou téléphone du candidat, adresse électronique, numéro de '
  'téléphone ou lien web dans un champ imprimé. Null si rien.';

-- ---------------------------------------------------------------------------
-- 3. HERACLES peut-il valider seul ?
-- ---------------------------------------------------------------------------
create or replace function public.cv_anonyme_validable_auto(fiche public.candidat)
returns boolean
language sql
stable
set search_path = public
as $$
  select (fiche.cv_chemin is not null or nullif(btrim(coalesce(fiche.cv_url, '')), '') is not null)
     and fiche.cv_anonyme_chemin is null
     and nullif(btrim(coalesce(fiche.cv_anonyme_url, '')), '') is null
     and (nullif(btrim(coalesce(fiche.emploi_recherche, '')), '') is not null
       or nullif(btrim(coalesce(fiche.metier_libelle, '')), '') is not null)
     and public.mot_de_fermeture(fiche.cloture) is null
     and public.mot_de_fermeture(fiche.archive) is null
     and public.cv_anonyme_suspect(fiche) is null
$$;

comment on function public.cv_anonyme_validable_auto(public.candidat) is
  'Vrai si HERACLES valide seul le CV anonyme : CV original présent, aucun CV '
  'anonyme déposé, un emploi recherché, dossier en cours, rien de suspect.';

revoke all on function public.texte_reduit(text) from public, anon, authenticated;
revoke all on function public.cv_anonyme_suspect(public.candidat) from public, anon, authenticated;
revoke all on function public.cv_anonyme_validable_auto(public.candidat) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le déclencheur de 0073 et 0075, qui valide aussi
-- ---------------------------------------------------------------------------
create or replace function public.relire_le_cv_anonyme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  imprime_change   boolean := false;
  entrees_changent boolean := true;
begin
  -- Hors des fonctions de 0073 à 0076, une session n'écrit rien de la
  -- validation ni de la copie : à la création, tout part de zéro ; à la
  -- modification, tout reste comme avant.
  if auth.uid() is not null
     and coalesce(current_setting('heracles.validation_cv_anonyme', true), '') <> 'oui' then
    if tg_op = 'INSERT' then
      new.cv_anonyme_valide_le   := null;
      new.cv_anonyme_valide_par  := null;
      new.cv_anonyme_valide_auto := false;
      new.cv_anonyme_retire_le   := null;
      new.cv_anonyme_fige_chemin := null;
      new.cv_anonyme_fige_le     := null;
    else
      new.cv_anonyme_valide_le   := old.cv_anonyme_valide_le;
      new.cv_anonyme_valide_par  := old.cv_anonyme_valide_par;
      new.cv_anonyme_valide_auto := old.cv_anonyme_valide_auto;
      new.cv_anonyme_retire_le   := old.cv_anonyme_retire_le;
      new.cv_anonyme_fige_chemin := old.cv_anonyme_fige_chemin;
      new.cv_anonyme_fige_le     := old.cv_anonyme_fige_le;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Ce qui s'imprime sur le CV anonyme.
    imprime_change :=
      (new.numero, new.type_emploi, new.emploi_recherche, new.secteur_activite_libelle,
       new.metier_libelle, new.debut_stage, new.mobilite_geographique, new.permis_vl,
       new.vehicule, new.experiences, new.formations, new.competences,
       new.savoir_etre, new.informatique)
      is distinct from
      (old.numero, old.type_emploi, old.emploi_recherche, old.secteur_activite_libelle,
       old.metier_libelle, old.debut_stage, old.mobilite_geographique, old.permis_vl,
       old.vehicule, old.experiences, old.formations, old.competences,
       old.savoir_etre, old.informatique);

    -- Et ce dont la validation de HERACLES dépend en plus.
    entrees_changent := imprime_change or
      (new.nom, new.prenom, new.email, new.telephone, new.adresse,
       new.cv_chemin, new.cv_url, new.cv_anonyme_chemin, new.cv_anonyme_url,
       new.cloture, new.archive)
      is distinct from
      (old.nom, old.prenom, old.email, old.telephone, old.adresse,
       old.cv_chemin, old.cv_url, old.cv_anonyme_chemin, old.cv_anonyme_url,
       old.cloture, old.archive);
  end if;

  -- Ce qui s'imprime a changé : le CV est à relire. Vaut aussi pour la reprise
  -- de Bubble, qui modifie la fiche sans session. Une validation retirée par
  -- un référent cesse alors de retenir HERACLES.
  if imprime_change then
    new.cv_anonyme_valide_le   := null;
    new.cv_anonyme_valide_par  := null;
    new.cv_anonyme_valide_auto := false;
    new.cv_anonyme_retire_le   := null;
  end if;

  if entrees_changent then
    if new.cv_anonyme_valide_auto and not public.cv_anonyme_validable_auto(new) then
      -- HERACLES avait validé ; ce n'est plus propre : il retire.
      new.cv_anonyme_valide_le   := null;
      new.cv_anonyme_valide_par  := null;
      new.cv_anonyme_valide_auto := false;
    elsif new.cv_anonyme_valide_le is null
          and new.cv_anonyme_retire_le is null
          and public.cv_anonyme_validable_auto(new) then
      new.cv_anonyme_valide_le   := now();
      new.cv_anonyme_valide_par  := null;
      new.cv_anonyme_valide_auto := true;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.relire_le_cv_anonyme() is
  'Réserve la validation du CV anonyme et sa copie aux fonctions de 0073 à '
  '0076 ; efface la validation quand un champ imprimé change ; la donne au '
  'nom de HERACLES quand rien n''est suspect (0076).';

drop trigger if exists candidat_relire_le_cv_anonyme on public.candidat;
create trigger candidat_relire_le_cv_anonyme
  before insert or update on public.candidat
  for each row execute function public.relire_le_cv_anonyme();

-- ---------------------------------------------------------------------------
-- 5. `maj_le` ne bouge toujours pas pour la validation
-- ---------------------------------------------------------------------------
create or replace function public.toucher_maj_le()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'candidat'
     and (to_jsonb(new) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par'
                        - 'cv_anonyme_fige_chemin' - 'cv_anonyme_fige_le'
                        - 'cv_anonyme_valide_auto' - 'cv_anonyme_retire_le')
       = (to_jsonb(old) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par'
                        - 'cv_anonyme_fige_chemin' - 'cv_anonyme_fige_le'
                        - 'cv_anonyme_valide_auto' - 'cv_anonyme_retire_le') then
    new.maj_le := old.maj_le;
    return new;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Valider à la main — la fonction de 0074, qui retient le retrait
-- ---------------------------------------------------------------------------
create or replace function public.valider_cv_anonyme(cible uuid, valider boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moi   uuid := public.referent_courant();
  fiche public.candidat%rowtype;
begin
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     for update;

  -- Un dossier inexistant et un dossier d'ailleurs refusent pareil : rien ne
  -- s'apprend en essayant.
  if moi is null or not found or not public.peut_valider_le_cv_anonyme(fiche) then
    raise exception 'Seuls les référents de la loge du candidat valident son CV anonyme'
      using errcode = 'insufficient_privilege';
  end if;

  if valider is null then
    raise exception 'Valider ou retirer : il faut choisir'
      using errcode = 'invalid_parameter_value';
  end if;

  if valider then
    if public.mot_de_fermeture(fiche.cloture) is not null
       or public.mot_de_fermeture(fiche.archive) is not null then
      return 'ferme';
    end if;
    if nullif(btrim(coalesce(fiche.emploi_recherche, '')), '') is null
       and nullif(btrim(coalesce(fiche.metier_libelle, '')), '') is null then
      return 'incomplet';
    end if;
  end if;

  perform set_config('heracles.validation_cv_anonyme', 'oui', true);
  -- `maj_le` ne bouge pas : relire le CV ne modifie pas la fiche. Retirer
  -- retient HERACLES jusqu'à la prochaine modification d'un champ imprimé.
  update public.candidat
     set cv_anonyme_valide_le   = case when valider then now() end,
         cv_anonyme_valide_par  = case when valider then moi end,
         cv_anonyme_valide_auto = false,
         cv_anonyme_retire_le   = case when valider then null else now() end
   where id = cible;
  perform set_config('heracles.validation_cv_anonyme', '', true);

  return case when valider then 'valide' else 'retire' end;
end;
$$;

revoke all on function public.valider_cv_anonyme(uuid, boolean) from public, anon;
grant execute on function public.valider_cv_anonyme(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. L'état, pour le bandeau : « par HERACLES »
-- ---------------------------------------------------------------------------
create or replace function public.etat_du_cv_anonyme(candidat_choisi uuid)
returns table (
  valide_le    timestamptz,
  valide_par   text,
  peut_valider boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.cv_anonyme_valide_le,
         case when c.cv_anonyme_valide_auto then 'HERACLES'
              else nullif(btrim(coalesce(v.prenom, '') || ' ' || coalesce(v.nom, '')), '') end,
         public.peut_valider_le_cv_anonyme(c)
    from public.candidat c
    left join public.referent v on v.id = c.cv_anonyme_valide_par
   where c.id = candidat_choisi
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

revoke all on function public.etat_du_cv_anonyme(uuid) from public, anon;
grant execute on function public.etat_du_cv_anonyme(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Figer — seulement la validation dont le PDF a été produit
--
-- Remplace `figer_cv_anonyme(uuid)` de 0075 : l'application produit d'abord
-- le PDF de la validation qu'elle a lue, puis demande à la figer. Si la
-- validation a changé entre-temps (fiche modifiée, revalidée), rien n'est
-- figé : `perimee`.
-- ---------------------------------------------------------------------------
drop function if exists public.figer_cv_anonyme(uuid);
drop function if exists public.figer_cv_anonyme(uuid, timestamptz);

create function public.figer_cv_anonyme(cible uuid, valide_le_attendu timestamptz)
returns table (issue text, chemin text, ancien text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  fiche   public.candidat%rowtype;
  nouveau text;
begin
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     for update;

  if public.referent_courant() is null or not found
     or not public.peut_valider_le_cv_anonyme(fiche) then
    raise exception 'Seuls les référents de la loge du candidat figent son CV anonyme'
      using errcode = 'insufficient_privilege';
  end if;

  if fiche.cv_anonyme_valide_le is null then
    return query select 'non_valide'::text, null::text, null::text;
    return;
  end if;

  if valide_le_attendu is null or fiche.cv_anonyme_valide_le <> valide_le_attendu then
    return query select 'perimee'::text, null::text, null::text;
    return;
  end if;

  -- Un fichier par validation : l'instant de la validation, en millisecondes.
  nouveau := format('candidats/%s/cv-anonyme-valide-%s.pdf',
                    fiche.id,
                    floor(extract(epoch from fiche.cv_anonyme_valide_le) * 1000)::bigint);

  perform set_config('heracles.validation_cv_anonyme', 'oui', true);
  update public.candidat
     set cv_anonyme_fige_chemin = nouveau,
         cv_anonyme_fige_le     = fiche.cv_anonyme_valide_le
   where id = cible;
  perform set_config('heracles.validation_cv_anonyme', '', true);

  return query select 'fige'::text, nouveau,
    case when fiche.cv_anonyme_fige_chemin is distinct from nouveau
         then fiche.cv_anonyme_fige_chemin end;
end;
$$;

comment on function public.figer_cv_anonyme(uuid, timestamptz) is
  'Enregistre la copie PDF de la validation en cours du CV anonyme, si c''est '
  'bien celle attendue : rend le chemin où la déposer, et celui de la copie '
  'qu''elle remplace. Référents de la loge du candidat.';

revoke all on function public.figer_cv_anonyme(uuid, timestamptz) from public, anon;
grant execute on function public.figer_cv_anonyme(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Figer depuis le lien public — la copie d'une validation de HERACLES
--
-- Une validation de HERACLES n'a pas de clic pour ranger sa copie : la
-- première ouverture du lien la range. Ouverte à `anon`, comme le lien :
-- le jeton est le droit. Elle n'écrit qu'un chemin calculé ici, une fois par
-- validation — une seconde ouverture ne rend rien.
-- ---------------------------------------------------------------------------
drop function if exists public.figer_cv_anonyme_public(uuid, timestamptz);

create function public.figer_cv_anonyme_public(jeton uuid, valide_le_attendu timestamptz)
returns table (chemin text, ancien text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  fiche   public.candidat%rowtype;
  nouveau text;
begin
  select c.* into fiche
    from public.candidat c
   where c.cv_anonyme_jeton = jeton
     and c.cv_anonyme_valide_le is not null
     and c.cv_anonyme_valide_le = valide_le_attendu
     and c.cv_anonyme_fige_le is distinct from c.cv_anonyme_valide_le
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
     for update;

  if not found then
    return;
  end if;

  nouveau := format('candidats/%s/cv-anonyme-valide-%s.pdf',
                    fiche.id,
                    floor(extract(epoch from fiche.cv_anonyme_valide_le) * 1000)::bigint);

  perform set_config('heracles.validation_cv_anonyme', 'oui', true);
  update public.candidat
     set cv_anonyme_fige_chemin = nouveau,
         cv_anonyme_fige_le     = fiche.cv_anonyme_valide_le
   where id = fiche.id;
  perform set_config('heracles.validation_cv_anonyme', '', true);

  return query select nouveau,
    case when fiche.cv_anonyme_fige_chemin is distinct from nouveau
         then fiche.cv_anonyme_fige_chemin end;
end;
$$;

comment on function public.figer_cv_anonyme_public(uuid, timestamptz) is
  'À la première ouverture du lien public d''un CV validé sans copie : '
  'enregistre la copie de cette validation-là. Rend le chemin où la déposer, '
  'et celui de la copie qu''elle remplace ; rien si c''est déjà fait.';

revoke all on function public.figer_cv_anonyme_public(uuid, timestamptz) from public;
grant execute on function public.figer_cv_anonyme_public(uuid, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Les dossiers déjà en base
--
-- Sans session : le déclencheur n'y touche pas, la mise à jour pose ce qu'elle
-- dit. `maj_le` ne bouge pas. Rejouée, elle ne retouche que ce qui n'est pas
-- encore validé.
-- ---------------------------------------------------------------------------
update public.candidat c
   set cv_anonyme_valide_le   = now(),
       cv_anonyme_valide_par  = null,
       cv_anonyme_valide_auto = true
 where c.cv_anonyme_valide_le is null
   and c.cv_anonyme_retire_le is null
   and public.cv_anonyme_validable_auto(c);
