-- ---------------------------------------------------------------------------
-- 0075 — une copie figée du CV anonyme, à chaque validation
--
-- Ce que ça change : quand un référent valide le CV anonyme (0073, 0074), le PDF
-- tel qu'il est à cet instant est rangé dans le seau. Le lien public — colonne
-- « CV » de l'affiche, QR code de l'affichette — et « Voir le CV anonyme »
-- servent cette copie : ce qui circule est **exactement** ce qui a été relu,
-- même si la mise en page change ensuite. Décision du 10 novembre 2026.
--
-- Jusqu'ici, le PDF était refabriqué à chaque ouverture. Le texte ne pouvait
-- pas bouger sans effacer la validation, mais la présentation, si.
--
-- LE CHEMIN EST CALCULÉ ICI, JAMAIS REÇU
--
-- `figer_cv_anonyme()` ne prend que le candidat : le chemin, c'est la base qui
-- le donne, à partir du candidat et de l'instant de la validation. Un chemin
-- reçu de la requête permettrait de faire servir par le lien public n'importe
-- quel fichier du seau — un CV nominatif, une photo. Et chaque validation a son
-- propre fichier : une copie qu'on n'aurait pas réussi à déposer ne laisse
-- jamais reparaître celle d'une validation précédente.
--
-- LA COPIE NE SERT QUE SA VALIDATION
--
-- `cv_anonyme_fige_le` retient la validation qu'elle fige. Le lien ne la sert
-- que si cette validation est la validation en cours : une fiche modifiée
-- (validation effacée), une validation retirée puis redonnée, et la copie se
-- tait jusqu'à la suivante. Elle reste dans le seau comme trace de ce qui a été
-- relu, et cède la place à la prochaine.
--
-- LES COLONNES NE S'ÉCRIVENT QUE PAR LA FONCTION
--
-- Même garde que la validation (0073) : un parrain peut modifier la fiche
-- (0006), il ne doit pas pouvoir faire pointer la copie ailleurs. Le
-- déclencheur remet en place les deux colonnes hors du drapeau de transaction.
-- ---------------------------------------------------------------------------

alter table public.candidat
  add column if not exists cv_anonyme_fige_chemin text,
  add column if not exists cv_anonyme_fige_le     timestamptz;

comment on column public.candidat.cv_anonyme_fige_chemin is
  'La copie PDF du CV anonyme rangée à la dernière validation, dans le seau '
  '« documents ». Chemin calculé par figer_cv_anonyme(), jamais saisi.';
comment on column public.candidat.cv_anonyme_fige_le is
  'La validation que cette copie fige : elle n''est servie que si c''est la '
  'validation en cours (cv_anonyme_valide_le).';

-- ---------------------------------------------------------------------------
-- 1. Le déclencheur de 0073, qui garde aussi la copie
-- ---------------------------------------------------------------------------
create or replace function public.relire_le_cv_anonyme()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('heracles.validation_cv_anonyme', true), '') <> 'oui' then
    new.cv_anonyme_valide_le   := old.cv_anonyme_valide_le;
    new.cv_anonyme_valide_par  := old.cv_anonyme_valide_par;
    new.cv_anonyme_fige_chemin := old.cv_anonyme_fige_chemin;
    new.cv_anonyme_fige_le     := old.cv_anonyme_fige_le;
  end if;

  -- Ce qui s'imprime sur le CV anonyme a changé : il est à relire. Vaut aussi
  -- pour la reprise de Bubble, qui modifie la fiche sans session.
  if (new.numero, new.type_emploi, new.emploi_recherche, new.secteur_activite_libelle,
      new.metier_libelle, new.debut_stage, new.mobilite_geographique, new.permis_vl,
      new.vehicule, new.experiences, new.formations, new.competences,
      new.savoir_etre, new.informatique)
     is distinct from
     (old.numero, old.type_emploi, old.emploi_recherche, old.secteur_activite_libelle,
      old.metier_libelle, old.debut_stage, old.mobilite_geographique, old.permis_vl,
      old.vehicule, old.experiences, old.formations, old.competences,
      old.savoir_etre, old.informatique) then
    new.cv_anonyme_valide_le  := null;
    new.cv_anonyme_valide_par := null;
  end if;

  return new;
end;
$$;

comment on function public.relire_le_cv_anonyme() is
  'Réserve la validation du CV anonyme et sa copie figée aux fonctions de 0073 '
  'à 0075, et efface la validation quand un champ imprimé sur le CV change.';

-- ---------------------------------------------------------------------------
-- 2. Figer n'est pas retoucher la fiche — `maj_le` ne bouge pas
-- ---------------------------------------------------------------------------
create or replace function public.toucher_maj_le()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'candidat'
     and (to_jsonb(new) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par'
                        - 'cv_anonyme_fige_chemin' - 'cv_anonyme_fige_le')
       = (to_jsonb(old) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par'
                        - 'cv_anonyme_fige_chemin' - 'cv_anonyme_fige_le') then
    new.maj_le := old.maj_le;
    return new;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Figer la copie de la validation en cours
--
-- Appelée par l'application juste après `valider_cv_anonyme()`, avec le même
-- droit (0074). Rend le chemin où déposer le PDF, et celui de la copie qu'il
-- remplace — à effacer du seau. `non_valide` si le CV n'est pas validé : il n'y
-- a rien à figer.
-- ---------------------------------------------------------------------------
drop function if exists public.figer_cv_anonyme(uuid);

create function public.figer_cv_anonyme(cible uuid)
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

comment on function public.figer_cv_anonyme(uuid) is
  'Enregistre la copie PDF de la validation en cours du CV anonyme : rend le '
  'chemin où la déposer, et celui de la copie qu''elle remplace.';

revoke all on function public.figer_cv_anonyme(uuid) from public, anon;
grant execute on function public.figer_cv_anonyme(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La copie de la validation en cours, pour « Voir le CV anonyme »
--
-- Même porte que `fiche_candidat()` : qui voit la fiche voit le CV.
-- ---------------------------------------------------------------------------
create or replace function public.copie_figee_du_cv_anonyme(candidat_choisi uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.cv_anonyme_fige_chemin
    from public.candidat c
   where c.id = candidat_choisi
     and c.cv_anonyme_valide_le is not null
     and c.cv_anonyme_fige_le = c.cv_anonyme_valide_le
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.copie_figee_du_cv_anonyme(uuid) is
  'Le chemin de la copie figée du CV anonyme, si elle est celle de la '
  'validation en cours. Porte de fiche_candidat().';

revoke all on function public.copie_figee_du_cv_anonyme(uuid) from public, anon;
grant execute on function public.copie_figee_du_cv_anonyme(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le lien public : la fonction de 0073, avec le chemin de la copie
--
-- Le type de retour change : `drop` puis `create`, à chaque passage — 0073,
-- rejouée avant, recrée l'ancienne forme.
-- ---------------------------------------------------------------------------
drop function if exists public.cv_anonyme_valide_public(uuid);

create function public.cv_anonyme_valide_public(jeton uuid)
returns table (
  numero                   integer,
  valide_le                timestamptz,
  type_emploi              text,
  emploi_recherche         text,
  secteur_activite_libelle text,
  metier_libelle           text,
  debut_stage              timestamptz,
  mobilite_geographique    text,
  permis_vl                text,
  vehicule                 text,
  experiences              text,
  formations               text,
  competences              text,
  savoir_etre              text,
  informatique             text,
  reglages                 jsonb,
  /** La copie de cette validation-ci, ou null : le PDF se produit alors. */
  fige_chemin              text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.numero,
         c.cv_anonyme_valide_le,
         c.type_emploi, c.emploi_recherche, c.secteur_activite_libelle, c.metier_libelle,
         c.debut_stage, c.mobilite_geographique, c.permis_vl, c.vehicule,
         c.experiences, c.formations, c.competences, c.savoir_etre, c.informatique,
         coalesce(m.reglages, '{}'::jsonb),
         case when c.cv_anonyme_fige_le = c.cv_anonyme_valide_le
              then c.cv_anonyme_fige_chemin end
    from public.candidat c
    left join public.mise_en_page m on m.document = 'cv_anonyme'
   where c.cv_anonyme_jeton = jeton
     and c.cv_anonyme_valide_le is not null
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

comment on function public.cv_anonyme_valide_public(uuid) is
  'Le CV validé désigné par ce jeton, d''un dossier en cours : sa copie figée '
  's''il y en a une pour cette validation, sinon ses champs anonymes et la '
  'mise en page pour le produire. Ouverte à anon : le QR code s''ouvre sans compte.';

revoke all on function public.cv_anonyme_valide_public(uuid) from public;
grant execute on function public.cv_anonyme_valide_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Supprimer un candidat emporte aussi la copie
--
-- La fonction de 0069, à l'identique, avec un fichier de plus dans la liste
-- de ce que la route efface du seau.
-- ---------------------------------------------------------------------------
create or replace function public.supprimer_un_candidat(cible uuid)
returns table (issue text, fichiers text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche       public.candidat%rowtype;
  affichettes text[];
begin
  if not public.puis_je_supprimer_des_candidats() then
    raise exception 'Ce compte ne peut pas supprimer de candidat'
      using errcode = 'insufficient_privilege';
  end if;

  -- De l'extérieur, un candidat d'une autre loge et un candidat absent se
  -- ressemblent : c'est voulu.
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     and (public.est_admin() or c.loge_id = public.ma_loge());

  if not found then
    return query select 'introuvable'::text, array[]::text[];
    return;
  end if;

  if fiche.bubble_id is not null then
    return query select 'bubble'::text, array[]::text[];
    return;
  end if;

  if fiche.profil_id is not null then
    return query select 'compte'::text, array[]::text[];
    return;
  end if;

  -- Lus avant la suppression : la cascade les emporte avec le dossier.
  select coalesce(array_agg(d.chemin) filter (where d.chemin is not null), array[]::text[])
    into affichettes
    from public.document d
   where d.candidat_id = cible;

  -- L'invitation qui a ouvert le dossier porte l'adresse du candidat et un
  -- lien vers lui : elle part avec lui.
  delete from public.parrainage p where p.candidat_id = cible;

  -- Le journal suit, par la cascade posée en 0021 ; les affichettes, par
  -- celle de 0069.
  delete from public.candidat c where c.id = cible;

  return query select 'supprime'::text,
    array_remove(array[fiche.cv_chemin, fiche.cv_anonyme_chemin,
                       fiche.lettre_motivation_chemin, fiche.photo_chemin,
                       fiche.cv_anonyme_fige_chemin], null)
    || affichettes;
end
$$;

comment on function public.supprimer_un_candidat(uuid) is
  'Supprime un candidat, son journal, ses affichettes archivées et '
  'l''invitation qui l''a ouvert, sans retour. Rend les chemins de ses '
  'fichiers — copie figée du CV anonyme comprise —, à retirer du seau par la '
  'route. Refuse les dossiers repris de Bubble et ceux qui ont un compte.';

revoke all on function public.supprimer_un_candidat(uuid) from public, anon;
grant execute on function public.supprimer_un_candidat(uuid) to authenticated;
