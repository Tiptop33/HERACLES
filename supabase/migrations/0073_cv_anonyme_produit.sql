-- ---------------------------------------------------------------------------
-- 0073 — le CV anonyme produit par HERACLES, relu et validé par le référent
--
-- Ce que ça change : HERACLES produit le CV anonyme de chaque candidat à
-- partir de sa fiche, comme le faisait Bubble à l'envoi de la fiche. Le lien
-- public (`/cv-anonyme/<jeton>`, colonne « CV » de l'affiche, QR code de
-- l'affichette) ne le sert qu'une fois que le **référent du dossier** l'a relu
-- et validé. Jusque-là, il sert le fichier repris de Bubble ou déposé à la
-- main, comme avant.
--
--   1. `candidat.cv_anonyme_valide_le` / `cv_anonyme_valide_par` — qui a
--      validé, et quand ;
--   2. un déclencheur : seule `valider_cv_anonyme()` touche à la validation,
--      et toute modification d'un champ imprimé sur le CV l'efface — le CV
--      est à relire. Valider ne change pas la « dernière mise à jour » ;
--   3. `valider_cv_anonyme()` — valider ou retirer la validation, réservé au
--      référent du dossier ;
--   4. `etat_du_cv_anonyme()` — ce que le bandeau de la fiche affiche ;
--   5. `cv_anonyme_valide_public()` — les champs anonymes d'un CV validé, et
--      les réglages de sa mise en page, pour le lien public ;
--   6. l'affiche et l'affichette portent le lien d'un CV validé ;
--   7. `mise_en_page` accepte le document `cv_anonyme`.
--
-- POURQUOI UNE VALIDATION
--
-- Bubble publiait le CV anonyme dès l'envoi de la fiche. Or les champs libres
-- (expériences, compétences) peuvent porter le nom d'un employeur, voire le
-- nom ou l'adresse de la personne : il suffit d'une ligne pour qu'un CV
-- « anonyme » ne le soit plus. Le choix des champs imprimés écarte l'identité ;
-- la relecture par le référent écarte le reste. Décision du 10 novembre 2026.
--
-- CE QUI NE SORT JAMAIS PAR LE LIEN PUBLIC
--
-- Nom, prénom, courriel, téléphone, âge, situation familiale, adresse, ville,
-- photo, loge, référent, parrain. `cv_anonyme_valide_public()` ne les
-- sélectionne pas : un oubli dans la route ne peut pas les faire apparaître.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Qui a validé, et quand
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists cv_anonyme_valide_le timestamptz,
  add column if not exists cv_anonyme_valide_par uuid references public.referent (id) on delete set null;

comment on column public.candidat.cv_anonyme_valide_le is
  'Le CV anonyme produit par HERACLES a été relu et validé par le référent à '
  'cette date. Effacée dès qu''un champ imprimé sur le CV change.';
comment on column public.candidat.cv_anonyme_valide_par is
  'Le référent qui a validé le CV anonyme.';

-- ---------------------------------------------------------------------------
-- 2. Le déclencheur
--
-- Même mécanisme que la désignation du référent (0057) : la fonction lève un
-- drapeau propre à sa transaction, le déclencheur ne laisse passer la
-- validation que sous ce drapeau. Un client ne peut pas le lever lui-même :
-- PostgREST ne pose aucun paramètre de session arbitraire. Sans lui, un parrain
-- — qui peut modifier la fiche (0006) — pourrait se valider le CV.
--
-- Son nom le fait passer après `candidat_avant_modification` et
-- `candidat_garder_les_decisions` (ordre alphabétique) : il compare des
-- valeurs déjà remises en place par eux.
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
    new.cv_anonyme_valide_le  := old.cv_anonyme_valide_le;
    new.cv_anonyme_valide_par := old.cv_anonyme_valide_par;
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
  'Réserve la validation du CV anonyme à valider_cv_anonyme(), et l''efface '
  'quand un champ imprimé sur le CV change.';

drop trigger if exists candidat_relire_le_cv_anonyme on public.candidat;
create trigger candidat_relire_le_cv_anonyme
  before update on public.candidat
  for each row execute function public.relire_le_cv_anonyme();

-- ---------------------------------------------------------------------------
-- 2 bis. Valider n'est pas retoucher la fiche
--
-- La fonction de 0071, à l'identique, avec deux colonnes de plus à ignorer :
-- `maj_le` (« dernière mise à jour » sur la fiche) ne bouge pas quand le
-- référent valide ou retire sa validation.
-- ---------------------------------------------------------------------------
create or replace function public.toucher_maj_le()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'candidat'
     and (to_jsonb(new) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par')
       = (to_jsonb(old) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au'
                        - 'cv_anonyme_valide_le' - 'cv_anonyme_valide_par') then
    new.maj_le := old.maj_le;
    return new;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Valider, ou retirer la validation
--
-- Le référent du dossier, et lui seul — décision du 10 novembre 2026. Le
-- refus est le même pour un dossier qui n'existe pas et pour un dossier
-- qu'on ne suit pas : rien ne s'apprend en essayant.
--
-- Rend `valide`, `retire`, ou la raison du refus : `ferme` (dossier clôturé
-- ou archivé, le lien est éteint), `incomplet` (ni emploi recherché ni
-- métier : le CV n'aurait pas de titre).
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

  if moi is null or not found or fiche.referent_id is distinct from moi then
    raise exception 'Seul le référent du dossier valide son CV anonyme'
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
  -- `maj_le` ne bouge pas : relire le CV ne modifie pas la fiche.
  update public.candidat
     set cv_anonyme_valide_le  = case when valider then now() end,
         cv_anonyme_valide_par = case when valider then moi end
   where id = cible;
  perform set_config('heracles.validation_cv_anonyme', '', true);

  return case when valider then 'valide' else 'retire' end;
end;
$$;

comment on function public.valider_cv_anonyme(uuid, boolean) is
  'Le référent du dossier valide le CV anonyme produit par HERACLES (ou retire '
  'sa validation). Validé, il est servi par le lien public.';

revoke all on function public.valider_cv_anonyme(uuid, boolean) from public, anon;
grant execute on function public.valider_cv_anonyme(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. L'état, pour le bandeau de la fiche
--
-- Même porte que `fiche_candidat()` (0057) : qui voit la fiche voit l'état.
-- Les boutons, eux, ne s'affichent qu'au référent (`peut_valider`), et la base
-- revérifie à la validation.
-- ---------------------------------------------------------------------------
drop function if exists public.etat_du_cv_anonyme(uuid);

create function public.etat_du_cv_anonyme(candidat_choisi uuid)
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
         nullif(btrim(coalesce(v.prenom, '') || ' ' || coalesce(v.nom, '')), ''),
         coalesce(c.referent_id = public.referent_courant(), false)
    from public.candidat c
    left join public.referent v on v.id = c.cv_anonyme_valide_par
   where c.id = candidat_choisi
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.etat_du_cv_anonyme(uuid) is
  'Le CV anonyme d''un candidat que je peux voir : validé ou non, par qui, et '
  'si c''est à moi de le valider.';

revoke all on function public.etat_du_cv_anonyme(uuid) from public, anon;
grant execute on function public.etat_du_cv_anonyme(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le lien public : le CV validé
--
-- Une fonction à côté de `cv_anonyme_public()` (0067), qui reste telle quelle
-- et continue de rendre le fichier déposé. La remplacer aurait changé son type
-- de retour, que 0067 — rejouée à chaque déploiement — ne saurait pas recréer.
--
-- La route demande d'abord celle-ci : une ligne, c'est un CV validé d'un
-- dossier en cours, à produire. Sinon, le fichier, comme avant.
--
-- Les réglages rendus sont ceux de la mise en page du CV anonyme — imprimés
-- sur le CV, donc publics de toute façon : `anon` ne lit pas la table
-- `mise_en_page`, il les reçoit ici.
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
  reglages                 jsonb
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
         coalesce(m.reglages, '{}'::jsonb)
    from public.candidat c
    left join public.mise_en_page m on m.document = 'cv_anonyme'
   where c.cv_anonyme_jeton = jeton
     and c.cv_anonyme_valide_le is not null
     -- Le dossier refermé, le lien s'éteint : même règle qu'à l'écran (0029).
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

comment on function public.cv_anonyme_valide_public(uuid) is
  'Les champs anonymes du CV désigné par ce jeton, s''il a été validé par le '
  'référent et que le dossier est en cours. Ouverte à anon, comme '
  'cv_anonyme_public() : le QR code de l''affichette s''ouvre sans compte.';

revoke all on function public.cv_anonyme_valide_public(uuid) from public;
grant execute on function public.cv_anonyme_valide_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. L'affiche et l'affichette : le lien d'un CV validé
--
-- Les deux fonctions de 0067, à l'identique, sauf la condition du jeton : un
-- CV validé vaut un fichier déposé. `drop` puis `create` à chaque passage,
-- pour la même raison qu'au § 5.
-- ---------------------------------------------------------------------------
drop function if exists public.commission_du_candidat(uuid);

create function public.commission_du_candidat(candidat_choisi uuid)
returns table (
  loge_nom             text,
  venerable_prenom     text,
  venerable_nom        text,
  venerable_telephone  text,
  venerable_email      text,
  secretaire_prenom    text,
  secretaire_nom       text,
  secretaire_telephone text,
  secretaire_email     text,
  cv_anonyme_jeton     uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select l.nom,
         v.prenom, v.nom, v.telephone, v.email,
         s.prenom, s.nom, s.telephone, s.email,
         case when c.cv_anonyme_chemin is not null or c.cv_anonyme_valide_le is not null
              then c.cv_anonyme_jeton end
    from public.candidat c
    left join public.loge l on l.id = c.loge_id
    left join lateral public.officier_de_la_loge(c.loge_id, array['vénérable maître', 'vénérable']) v on true
    left join lateral public.officier_de_la_loge(c.loge_id, array['secrétaire']) s on true
   where c.id = candidat_choisi
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.commission_du_candidat(uuid) is
  'La commission d''un candidat que je peux voir : sa loge, son vénérable et '
  'son secrétaire, et le jeton du CV anonyme s''il en a un (fichier déposé ou '
  'CV validé). Porte de fiche_candidat().';

revoke all on function public.commission_du_candidat(uuid) from public, anon;
grant execute on function public.commission_du_candidat(uuid) to authenticated;

drop function if exists public.dossiers_en_cours(uuid);

create function public.dossiers_en_cours(reunion_choisie uuid)
returns table (
  candidat_id       uuid,
  numero            integer,
  ouvert_le         date,
  emploi            text,
  recherche         text,
  nom               text,
  prenom            text,
  referent_nom      text,
  commentaire       text,
  a_un_cv           boolean,
  definition_emploi text,
  metier_libelle    text,
  type_emploi       text,
  cv_anonyme_jeton  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.ma_loge()
  )
  select c.id, c.numero, c.cree_le::date,
         coalesce(nullif(btrim(c.metier_libelle), ''), c.emploi_recherche),
         c.emploi_recherche,
         c.nom, c.prenom,
         r.nom,
         dernier.texte,
         (c.cv_chemin is not null or c.cv_url is not null),
         c.definition_emploi,
         c.metier_libelle,
         c.type_emploi,
         case when c.cv_anonyme_chemin is not null or c.cv_anonyme_valide_le is not null
              then c.cv_anonyme_jeton end
    from public.candidat c
    join la_reunion lr on c.loge_id = lr.loge_id
    left join public.referent r on r.id = c.referent_id
    left join lateral (
      select s.texte
        from public.suivi s
       where s.candidat_id = c.id and s.retire_le is null
       order by s.fait_le desc nulls last, s.cree_le desc
       limit 1
    ) as dernier on true
   where public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
   order by c.numero asc nulls last, c.nom, c.prenom
$$;

comment on function public.dossiers_en_cours(uuid) is
  'Les dossiers en cours de la loge de cette réunion, avec leur dernier '
  'commentaire de suivi et le jeton du CV anonyme quand il existe (fichier '
  'déposé ou CV validé, 0073). Clôturés et archivés en sont exclus (0029). '
  'Sert le compte rendu et l''affiche.';

revoke all on function public.dossiers_en_cours(uuid) from public, anon;
grant execute on function public.dossiers_en_cours(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. La mise en page du CV anonyme se règle comme les trois autres documents
-- ---------------------------------------------------------------------------
alter table public.mise_en_page
  drop constraint if exists mise_en_page_document_check;
alter table public.mise_en_page
  add constraint mise_en_page_document_check
  check (document in ('compte_rendu', 'affiche', 'affichette', 'cv_anonyme'));

alter table public.mise_en_page_image
  drop constraint if exists mise_en_page_image_document_check;
alter table public.mise_en_page_image
  add constraint mise_en_page_image_document_check
  check (document in ('compte_rendu', 'affiche', 'affichette', 'cv_anonyme'));
