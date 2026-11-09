-- ---------------------------------------------------------------------------
-- 0067 — la mise en page des trois documents de la commission
--
-- Ce que ça change : le compte rendu, l'affiche et l'affichette sortent à
-- l'identique de ceux que produisait Bubble, et leur présentation se règle
-- dans Paramètres › Mise en page, sans mise en ligne.
--
--   1. `mise_en_page` — les réglages de chaque document : textes, tailles,
--      couleurs, marges, colonnes. Seuls les écarts à la présentation
--      d'origine sont stockés ; l'origine elle-même est dans le code ;
--   2. `mise_en_page_image` — les images qu'un administrateur a déposées à la
--      place des emblèmes d'origine ;
--   3. `candidat.cv_anonyme_jeton` et `cv_anonyme_public()` — le lien du CV
--      anonyme que portent l'affiche (colonne « CV ») et l'affichette (QR
--      code) ;
--   4. de quoi remplir les documents : le vénérable et le secrétaire de la
--      commission, le nombre de dossiers traités, la prochaine réunion déjà
--      inscrite, les offres remontées à la commission.
--
-- POURQUOI LES RÉGLAGES SE LISENT PAR TOUTE PERSONNE CONNECTÉE
--
-- Les documents se produisent depuis la session de qui les demande — un
-- référent à la fin d'une réunion, pas seulement l'administration. Lire les
-- réglages est donc la condition pour produire le document ; les écrire reste
-- à l'administration, par trois fonctions qui le vérifient (§ 2 bis). Ce
-- qu'ils contiennent (titres, listes de diffusion) est imprimé sur chaque
-- document que la loge reçoit : rien de plus n'est exposé.
--
-- LE LIEN DU CV ANONYME — UNE PORTE OUVERTE À `anon`, ET UNE SEULE
--
-- 0007 pose que `anon` ne lit rien. C'est ici l'exception, demandée : l'affiche
-- et l'affichette **circulent** hors de l'application, et le QR code doit
-- s'ouvrir sur le téléphone de qui la reçoit, sans compte. Bubble y mettait
-- l'adresse publique de son CDN ; on la remplace par une adresse d'HERACLES
-- qui ne donne que ceci :
--
--   · le **CV anonyme** — jamais le CV nominatif, ni la lettre, ni la fiche ;
--   · d'un dossier **en cours** — clôturé ou archivé, le lien s'éteint seul ;
--   · à qui détient le **jeton** — 122 bits tirés au hasard, propres à chaque
--     candidat : l'adresse ne se devine pas, et ne dit rien de la personne.
--
-- La fonction rend le chemin du fichier, pas le fichier : c'est la route qui le
-- lit ensuite, et seulement après cette vérification (règle 3 du projet).
--
-- LE VÉNÉRABLE ET LE SECRÉTAIRE
--
-- « Président de la commission » sur l'affichette et en pied du compte rendu :
-- c'est le référent de la loge qui porte le titre « Vénérable Maître » au
-- collège (0017). `referent.college` est du texte libre, comparé sous sa forme
-- réduite comme en 0041. Un titre porté par deux fiches : la première par ordre
-- alphabétique, plutôt qu'une erreur au moment d'imprimer.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les réglages
-- ---------------------------------------------------------------------------
create table if not exists public.mise_en_page (
  document  text primary key
            check (document in ('compte_rendu', 'affiche', 'affichette')),
  -- Les écarts à l'origine, clé par clé : { "entete.titre.taille": 16, … }.
  reglages  jsonb not null default '{}'::jsonb
            check (jsonb_typeof(reglages) = 'object'),
  maj_le    timestamptz not null default now(),
  maj_par   uuid references public.profil (id) on delete set null
);

comment on table public.mise_en_page is
  'Les réglages de présentation du compte rendu, de l''affiche et de '
  'l''affichette. Seuls les écarts à la présentation d''origine sont stockés.';

alter table public.mise_en_page enable row level security;

drop policy if exists mise_en_page_lecture on public.mise_en_page;
create policy mise_en_page_lecture on public.mise_en_page
  for select to authenticated
  using (true);

-- Lecture seule pour les sessions : l'écriture passe par les fonctions du
-- § 2 bis, réservées à l'administration. Aucune table de plus ne s'ouvre en
-- écriture depuis un écran (voir le contrôle de 0007).
grant select on public.mise_en_page to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Les images déposées
--
-- En base plutôt que dans le seau : quelques emblèmes de quelques dizaines de
-- kilo-octets, lus à chaque document par la session de qui le produit — donc
-- sous la RLS, sans clé de service. Le seau, lui, reste réservé aux pièces des
-- candidats.
--
-- PNG et JPEG seulement : ce sont les deux formats qu'un PDF sait embarquer.
-- ---------------------------------------------------------------------------
create table if not exists public.mise_en_page_image (
  document  text not null
            check (document in ('compte_rendu', 'affiche', 'affichette')),
  cle       text not null check (cle ~ '^[a-z0-9_.]{1,80}$'),
  type      text not null check (type in ('image/png', 'image/jpeg')),
  -- Le fichier en base64. Trois millions de caractères : un peu plus de deux
  -- mégaoctets d'image, bien au-delà d'un logo.
  donnees   text not null check (length(donnees) between 1 and 3000000),
  maj_le    timestamptz not null default now(),
  maj_par   uuid references public.profil (id) on delete set null,
  primary key (document, cle)
);

comment on table public.mise_en_page_image is
  'Les images déposées dans Paramètres › Mise en page, à la place des emblèmes '
  'd''origine. Une par emplacement et par document.';

alter table public.mise_en_page_image enable row level security;

drop policy if exists mise_en_page_image_lecture on public.mise_en_page_image;
create policy mise_en_page_image_lecture on public.mise_en_page_image
  for select to authenticated
  using (true);

grant select on public.mise_en_page_image to authenticated;

-- ---------------------------------------------------------------------------
-- 2 bis. Écrire : trois gestes, réservés à l'administration
--
-- Des fonctions plutôt que des droits sur les tables : la liste des tables
-- qu'un écran modifie reste celle que 0007 contrôle, et chaque geste dit ce
-- qu'il fait.
--
-- `regler_la_mise_en_page` **fusionne** au lieu de remplacer : deux
-- administrateurs qui règlent chacun un champ ne s'effacent pas l'un l'autre.
-- Le contenu des valeurs — un nombre là où on attend un nombre, une couleur
-- bien formée — est vérifié par l'application, qui connaît chaque champ ; la
-- base garantit qu'on ne règle que les trois documents, et que l'objet reste
-- un objet.
-- ---------------------------------------------------------------------------
create or replace function public.regler_la_mise_en_page(
  document_choisi text,
  valeurs         jsonb,
  retirer         text[] default '{}',
  tout_retablir   boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  resultat jsonb;
begin
  if not public.est_admin() then
    raise exception 'La mise en page se règle par l''administration.'
      using errcode = 'insufficient_privilege';
  end if;
  if valeurs is null or jsonb_typeof(valeurs) <> 'object' then
    raise exception 'Les réglages attendus sont un objet.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.mise_en_page (document, reglages, maj_le, maj_par)
  values (document_choisi, '{}'::jsonb, now(), auth.uid())
  on conflict (document) do nothing;

  update public.mise_en_page m
     set reglages = case when tout_retablir then '{}'::jsonb
                         else (m.reglages || valeurs) - coalesce(retirer, '{}') end,
         maj_le   = now(),
         maj_par  = auth.uid()
   where m.document = document_choisi
  returning m.reglages into resultat;

  -- Revenir à l'origine, c'est aussi rendre les emblèmes d'origine.
  if tout_retablir then
    delete from public.mise_en_page_image i where i.document = document_choisi;
  end if;

  return resultat;
end;
$$;

comment on function public.regler_la_mise_en_page(text, jsonb, text[], boolean) is
  'Fusionne des réglages dans ceux du document, en retire, ou revient à la '
  'présentation d''origine (images comprises). Administration seulement.';

revoke all on function public.regler_la_mise_en_page(text, jsonb, text[], boolean) from public, anon;
grant execute on function public.regler_la_mise_en_page(text, jsonb, text[], boolean) to authenticated;

create or replace function public.deposer_une_image_de_mise_en_page(
  document_choisi text,
  cle_choisie     text,
  type_choisi     text,
  donnees_base64  text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'La mise en page se règle par l''administration.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.mise_en_page_image (document, cle, type, donnees, maj_le, maj_par)
  values (document_choisi, cle_choisie, type_choisi, donnees_base64, now(), auth.uid())
  on conflict (document, cle) do update
     set type = excluded.type, donnees = excluded.donnees,
         maj_le = excluded.maj_le, maj_par = excluded.maj_par;
end;
$$;

revoke all on function public.deposer_une_image_de_mise_en_page(text, text, text, text) from public, anon;
grant execute on function public.deposer_une_image_de_mise_en_page(text, text, text, text) to authenticated;

create or replace function public.retirer_une_image_de_mise_en_page(
  document_choisi text,
  cle_choisie     text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'La mise en page se règle par l''administration.'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.mise_en_page_image i
   where i.document = document_choisi and i.cle = cle_choisie;
end;
$$;

revoke all on function public.retirer_une_image_de_mise_en_page(text, text) from public, anon;
grant execute on function public.retirer_une_image_de_mise_en_page(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le lien du CV anonyme
--
-- Une valeur par défaut volatile : `add column` la tire **ligne par ligne**,
-- chaque candidat existant reçoit donc son propre jeton, et chaque nouveau
-- candidat le sien à l'insertion. La reprise Bubble ne connaît pas la colonne
-- et n'y touche pas.
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists cv_anonyme_jeton uuid not null default gen_random_uuid();

create unique index if not exists candidat_cv_anonyme_jeton_idx
  on public.candidat (cv_anonyme_jeton);

comment on column public.candidat.cv_anonyme_jeton is
  'Le jeton de l''adresse publique du CV anonyme (/cv-anonyme/<jeton>), que '
  'portent l''affiche et le QR code de l''affichette. Ne donne que le CV '
  'anonyme, et seulement tant que le dossier est en cours.';

create or replace function public.cv_anonyme_public(jeton uuid)
returns table (numero integer, chemin text)
language sql
stable
security definer
set search_path = public
as $$
  select c.numero, c.cv_anonyme_chemin
    from public.candidat c
   where c.cv_anonyme_jeton = jeton
     and c.cv_anonyme_chemin is not null
     -- Le dossier refermé, le lien s'éteint : même règle qu'à l'écran (0029).
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

comment on function public.cv_anonyme_public(uuid) is
  'Le chemin du CV anonyme désigné par ce jeton, si le dossier est en cours. '
  'Seule fonction ouverte à anon : le QR code de l''affichette s''ouvre sans compte.';

revoke all on function public.cv_anonyme_public(uuid) from public;
grant execute on function public.cv_anonyme_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le vénérable et le secrétaire d'une loge
--
-- Interne : aucune session ne l'appelle directement. Les deux fonctions
-- suivantes l'appellent après avoir vérifié la porte.
-- ---------------------------------------------------------------------------
create or replace function public.officier_de_la_loge(la_loge uuid, titres text[])
returns table (prenom text, nom text, telephone text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select r.prenom, r.nom, r.telephone, r.email
    from public.referent r
   where r.loge_id = la_loge
     and lower(btrim(r.college)) = any (titres)
   order by r.nom, r.prenom
   limit 1
$$;

revoke all on function public.officier_de_la_loge(uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ce qu'impriment le compte rendu et l'affiche d'une réunion
--
-- La porte est celle de 0055 : la réunion de ma loge, sinon aucune ligne.
-- ---------------------------------------------------------------------------
drop function if exists public.commission_de_la_reunion(uuid);

create function public.commission_de_la_reunion(reunion_choisie uuid)
returns table (
  loge_nom             text,
  lieu_reunions        text,
  /** Le plus grand numéro de dossier de la loge : « a traité plus de … ». */
  nombre_dossiers      integer,
  /** La réunion suivante, si elle est déjà inscrite au registre. */
  prochaine_reunion    date,
  venerable_prenom     text,
  venerable_nom        text,
  venerable_telephone  text,
  venerable_email      text,
  secretaire_prenom    text,
  secretaire_nom       text,
  secretaire_telephone text,
  secretaire_email     text
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
  select l.nom, l.lieu_reunions,
         (select max(c.numero) from public.candidat c where c.loge_id = lr.loge_id),
         (select min(u.tenue_le) from public.reunion u
           where u.loge_id = lr.loge_id
             and u.retire_le is null
             and u.tenue_le > lr.tenue_le),
         v.prenom, v.nom, v.telephone, v.email,
         s.prenom, s.nom, s.telephone, s.email
    from la_reunion lr
    join public.loge l on l.id = lr.loge_id
    left join lateral public.officier_de_la_loge(lr.loge_id, array['vénérable maître', 'vénérable']) v on true
    left join lateral public.officier_de_la_loge(lr.loge_id, array['secrétaire']) s on true
$$;

comment on function public.commission_de_la_reunion(uuid) is
  'La commission d''une réunion de ma loge : son nom, son lieu, son vénérable '
  'et son secrétaire, le nombre de dossiers traités et la réunion suivante si '
  'elle est inscrite. Rien hors de ma loge.';

revoke all on function public.commission_de_la_reunion(uuid) from public, anon;
grant execute on function public.commission_de_la_reunion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ce qu'imprime l'affichette d'un candidat
--
-- La porte est celle de `fiche_candidat()` (0057) : qui voit la fiche peut en
-- tirer l'affichette. Le jeton n'est rendu que si un CV anonyme existe — pas de
-- QR code vers un fichier absent.
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
         case when c.cv_anonyme_chemin is not null then c.cv_anonyme_jeton end
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
  'son secrétaire, et le jeton du CV anonyme s''il en a un. Porte de fiche_candidat().';

revoke all on function public.commission_du_candidat(uuid) from public, anon;
grant execute on function public.commission_du_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Les dossiers en cours, avec ce que les documents d'origine montrent
--
-- La forme de 0055, plus quatre colonnes :
--   · `definition_emploi` — la ligne en gras de « EMPLOI RECHERCHÉ » ;
--   · `metier_libelle` — en secours, quand la personne n'a rien écrit ;
--   · `type_emploi` — emploi, stage, alternance ;
--   · `cv_anonyme_jeton` — le lien « CV » de l'affiche, s'il y a un CV anonyme.
--
-- Le type de retour change : `create or replace` le refuserait. Et 0055,
-- rejouée à chaque déploiement, recrée l'ancienne forme juste avant celle-ci :
-- le `drop` est donc nécessaire à chaque passage, pas seulement au premier.
-- ---------------------------------------------------------------------------
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
         case when c.cv_anonyme_chemin is not null then c.cv_anonyme_jeton end
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
  'commentaire de suivi et le jeton du CV anonyme quand il existe. Clôturés et '
  'archivés en sont exclus (0029). Sert le compte rendu et l''affiche.';

revoke all on function public.dossiers_en_cours(uuid) from public, anon;
grant execute on function public.dossiers_en_cours(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Les offres remontées à la commission
--
-- Le tableau « OFFRES D'EMPLOI » des deux documents d'origine : les
-- entreprises qui proposent une offre (`propose_offre`, champ « offre_emp » de
-- Bubble). Le modèle repris ne porte ni le poste, ni le contact, ni l'e-mail :
-- les colonnes existent pour que le document garde sa forme, et se rempliront
-- avec le lot des offres. Une entreprise n'est pas une personne : la liste se
-- lit par toute session.
-- ---------------------------------------------------------------------------
create or replace function public.offres_de_la_commission()
returns table (
  ajoutee_le date,
  poste      text,
  societe    text,
  ville      text,
  contact    text,
  email      text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.cree_le::date, null::text, e.nom, null::text, null::text, null::text
    from public.entreprise e
   where e.propose_offre is true
   order by e.cree_le, e.nom
$$;

comment on function public.offres_de_la_commission() is
  'Les entreprises qui proposent une offre, pour le tableau « OFFRES D''EMPLOI » '
  'du compte rendu et de l''affiche.';

revoke all on function public.offres_de_la_commission() from public, anon;
grant execute on function public.offres_de_la_commission() to authenticated;
