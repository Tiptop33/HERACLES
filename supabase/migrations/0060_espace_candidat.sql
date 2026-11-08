-- ---------------------------------------------------------------------------
-- 0060 — l'espace candidat : un compte, et la fiche qu'il tient lui-même
--
-- Ce que ça change : un administrateur ouvre un dossier en ne saisissant que
-- l'adresse du candidat, l'identité de son parrain et la loge du dossier. Le
-- candidat reçoit une invitation, crée son compte, et tient ensuite sa fiche
-- lui-même, autant de fois qu'il le veut. Voir
-- docs/specs/2026-11-07-espace-candidat.md, § 6.
--
-- Ce parcours s'AJOUTE à celui de 0057 (le référent invite un parrain, qui
-- présente le candidat) ; il ne le remplace pas.
--
-- QUI APPELLE QUOI
--
--   · `inviter_un_candidat` : la route de l'administrateur, sous clé
--     service_role, après avoir vérifié la session. La fonction revérifie
--     elle-même que l'émetteur est administrateur, comme `emettre_invitation`
--     (0009) : une route peut être contournée, une fonction non ;
--   · `accepter_invitation` : inchangée dans sa forme, elle relie en plus le
--     compte à son dossier ;
--   · `ma_fiche`, `modifier_ma_fiche`, `ranger_mon_document` : le candidat,
--     par sa session. Elles ne voient que la fiche dont `profil_id` est
--     `auth.uid()`, et n'écrivent que des colonnes nommées.
--
-- POURQUOI DES FONCTIONS ET NON DES POLICIES
--
-- Une policy `update` sur `candidat` ouvrirait la ligne entière : le candidat
-- pourrait se donner un référent, changer sa loge, réécrire l'appréciation de
-- la commission ou son urgence. La liste blanche tient dans la fonction, comme
-- dans `completer_sa_candidature` (0057). Aucune policy n'est ajoutée à
-- `candidat` : la table reste fermée au candidat en lecture directe comme en
-- écriture.
--
-- LE SECOND PASSAGE
--
-- `accepter_invitation` est redéfinie ici. Au redéploiement, 0009 la recrée
-- dans sa forme d'origine, et celle-ci la rétablit quelques secondes plus
-- tard — la même fenêtre que pour 0059.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le parrain saisi par l'administrateur
--    Il n'a pas forcément de fiche `referent` : son identité se garde donc sur
--    le dossier. Mêmes noms que dans `parrainage` (0057) — un mot, une chose.
--    `parrain_email` existe depuis 0002.
-- ---------------------------------------------------------------------------
alter table public.candidat add column if not exists parrain_nom    text;
alter table public.candidat add column if not exists parrain_prenom text;
alter table public.candidat add column if not exists parrain_loge   text;

comment on column public.candidat.parrain_loge is
  'Le numéro de loge du parrain, tel que l''administrateur l''a saisi. Une '
  'information sur le parrain, pas le rattachement du dossier (`loge_id`).';

-- ---------------------------------------------------------------------------
-- 2. L'invitation sait quel dossier elle ouvre
-- ---------------------------------------------------------------------------
alter table public.invitation
  add column if not exists candidat_id uuid references public.candidat (id) on delete set null;

create index if not exists invitation_candidat_idx on public.invitation (candidat_id);

-- ---------------------------------------------------------------------------
-- 3. Le numéro suivant d'une loge
--    La règle de 0057, à l'identique : le compteur de la loge porte le DERNIER
--    numéro donné, et le plus grand du compteur et du plus haut numéro porté
--    l'emporte. `for update` sur la loge : deux ouvertures simultanées ne
--    reçoivent pas le même numéro.
-- ---------------------------------------------------------------------------
create or replace function public.prendre_un_numero(la_loge uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  dernier   integer;
  le_numero integer;
begin
  select l.prochain_numero_candidat into dernier
    from public.loge l
   where l.id = la_loge
     for update;

  if not found then
    raise exception 'Loge inconnue' using errcode = 'foreign_key_violation';
  end if;

  select greatest(coalesce(dernier, 0), coalesce(max(c.numero), 0)) + 1
    into le_numero
    from public.candidat c
   where c.loge_id = la_loge;

  update public.loge set prochain_numero_candidat = le_numero where id = la_loge;
  return le_numero;
end;
$$;

revoke all on function public.prendre_un_numero(uuid) from public, anon, authenticated;
grant execute on function public.prendre_un_numero(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. L'administrateur invite un candidat
--    Un seul geste : le dossier s'ouvre (loge choisie, numéro suivant, SANS
--    référent — une nouvelle demande, comme en 0057) et l'invitation part.
--
--    Réinviter la même adresse ne rouvre pas un second dossier : tant que le
--    candidat n'a pas accepté, l'invitation précédente est révoquée et la
--    nouvelle pointe le même dossier, dont le parrain est mis à jour. Un
--    dossier qui porte déjà cette adresse sans invitation en cours — repris de
--    Bubble, ou ouvert par un parrain — n'est pas doublé : la fonction refuse.
-- ---------------------------------------------------------------------------
create or replace function public.inviter_un_candidat(
  emetteur  uuid,
  adresse   text,
  loge_choisie uuid,
  parrain   jsonb,
  empreinte text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l_adresse   text := lower(btrim(adresse));
  p_nom       text := upper(nullif(btrim(parrain ->> 'nom'), ''));
  p_prenom    text := nullif(btrim(parrain ->> 'prenom'), '');
  p_loge      text := nullif(btrim(parrain ->> 'loge'), '');
  p_email     text := lower(nullif(btrim(parrain ->> 'email'), ''));
  le_parrain  uuid;
  le_dossier  uuid;
  le_numero   integer;
  la_loge_nom text;
  nouvelle    uuid;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut inviter' using errcode = 'insufficient_privilege';
  end if;

  if l_adresse is null or l_adresse = '' or l_adresse !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail du candidat invalide' using errcode = 'invalid_parameter_value';
  end if;

  if parrain is null or jsonb_typeof(parrain) <> 'object'
     or p_nom is null or p_prenom is null or p_loge is null or p_email is null then
    raise exception 'Le nom, le prénom, le numéro de loge et l''e-mail du parrain sont obligatoires'
      using errcode = 'check_violation';
  end if;

  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail du parrain invalide' using errcode = 'invalid_parameter_value';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  select l.nom into la_loge_nom from public.loge l where l.id = loge_choisie;
  if not found then
    raise exception 'Loge inconnue' using errcode = 'foreign_key_violation';
  end if;

  -- Déjà un compte : on n'invite pas quelqu'un qui est déjà entré.
  if exists (select 1 from auth.users u where lower(u.email) = l_adresse) then
    raise exception 'Cette adresse a déjà un compte' using errcode = 'unique_violation';
  end if;

  -- Le dossier ouvert par une invitation précédente, jamais acceptée.
  select i.candidat_id into le_dossier
    from public.invitation i
   where lower(i.email) = l_adresse
     and i.candidat_id is not null
     and i.etat <> 'acceptee'
   order by i.cree_le desc
   limit 1;

  if le_dossier is null and exists (
    select 1 from public.candidat c where lower(btrim(c.email)) = l_adresse
  ) then
    raise exception 'Un dossier existe déjà pour cette adresse' using errcode = 'unique_violation';
  end if;

  -- Le parrain est peut-être déjà dans HERACLES : il devient alors parrain du
  -- dossier au sens de 0006, et le lit. Même recherche qu'en 0057.
  select r.id into le_parrain
    from public.referent r
   where r.email is not null and lower(btrim(r.email)) = p_email
   order by r.cree_le, r.id
   limit 1;

  if le_dossier is null then
    le_numero := public.prendre_un_numero(loge_choisie);

    insert into public.candidat (
      numero, loge_id, referent_id, email,
      parrain_id, parrain_email, parrain_nom, parrain_prenom, parrain_loge
    ) values (
      le_numero, loge_choisie, null, l_adresse,
      le_parrain, p_email, p_nom, p_prenom, p_loge
    )
    returning id into le_dossier;
  else
    -- `auth.uid()` est nul sous service_role : le déclencheur de 0057 laisse
    -- donc passer `parrain_id`. La loge, elle, reste celle du dossier ouvert.
    update public.candidat
       set parrain_id     = le_parrain,
           parrain_email  = p_email,
           parrain_nom    = p_nom,
           parrain_prenom = p_prenom,
           parrain_loge   = p_loge,
           maj_le         = now()
     where id = le_dossier
    returning numero, (select l.nom from public.loge l where l.id = candidat.loge_id)
      into le_numero, la_loge_nom;
  end if;

  -- L'invitation précédente cesse de valoir : un seul lien vivant par adresse.
  update public.invitation
     set etat = 'refusee', repondu_le = now()
   where lower(email) = l_adresse and etat = 'envoyee';

  insert into public.invitation (
    email, role, loge_id, jeton_empreinte, invite_par, candidat_id, expire_le
  ) values (
    l_adresse, 'candidat', (select c.loge_id from public.candidat c where c.id = le_dossier),
    empreinte, emetteur, le_dossier, now() + interval '30 days'
  )
  returning id into nouvelle;

  return jsonb_build_object(
    'invitation_id', nouvelle,
    'candidat_id',   le_dossier,
    'numero',        le_numero,
    'loge_nom',      la_loge_nom
  );
end;
$$;

comment on function public.inviter_un_candidat(uuid, text, uuid, jsonb, text) is
  'L''administrateur ouvre un dossier dans la loge qu''il choisit, avec le '
  'parrain qu''il saisit, et invite le candidat à créer son compte.';

revoke all on function public.inviter_un_candidat(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.inviter_un_candidat(uuid, text, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Accepter une invitation (reprise de 0009)
--    Seul ajout : une invitation de candidat relie le compte à son dossier.
-- ---------------------------------------------------------------------------
create or replace function public.accepter_invitation(
  empreinte text,
  compte uuid,
  prenom_donne text,
  nom_donne text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invit public.invitation%rowtype;
  fiche uuid;
begin
  select * into invit from public.invitation where jeton_empreinte = empreinte;

  if invit.id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;
  if invit.etat <> 'envoyee' or invit.expire_le <= now() then
    raise exception 'Invitation caduque' using errcode = 'invalid_parameter_value';
  end if;

  -- L'invitation vaut pour l'adresse à laquelle elle a été envoyée, et pour
  -- elle seule : sans ce contrôle, un lien intercepté servirait à n'importe qui.
  if not exists (
    select 1 from auth.users u where u.id = compte and lower(u.email) = lower(invit.email)
  ) then
    raise exception 'Cette invitation ne vaut pas pour ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profil
     set role = invit.role,
         prenom = coalesce(nullif(trim(prenom_donne), ''), prenom),
         nom = coalesce(nullif(trim(nom_donne), ''), nom)
   where id = compte;

  -- Un accompagnant a une fiche métier, rattachée à sa loge. Elle existe peut-être
  -- déjà — reprise de Bubble et retrouvée par l'adresse — auquel cas on la complète.
  if invit.role in ('referent', 'admin') then
    select r.id into fiche from public.referent r where r.profil_id = compte;

    if fiche is null then
      select r.id into fiche
        from public.referent r
       where r.profil_id is null and lower(r.email) = lower(invit.email)
       order by r.cree_le, r.id
       limit 1;
    end if;

    if fiche is null then
      insert into public.referent (nom, prenom, email, loge_id, profil_id)
      values (nullif(trim(nom_donne), ''), nullif(trim(prenom_donne), ''),
              invit.email, invit.loge_id, compte);
    else
      update public.referent
         set profil_id = compte,
             loge_id = coalesce(loge_id, invit.loge_id),
             nom = coalesce(nom, nullif(trim(nom_donne), '')),
             prenom = coalesce(prenom, nullif(trim(prenom_donne), ''))
       where id = fiche;
    end if;
  end if;

  -- Un candidat retrouve son dossier. Seulement s'il n'a pas déjà de compte :
  -- un dossier ne change pas de titulaire. Le prénom et le nom qu'il vient de
  -- donner commencent sa fiche — sans rien écraser de ce qu'elle porterait.
  if invit.role = 'candidat' and invit.candidat_id is not null then
    update public.candidat
       set profil_id = compte,
           prenom    = coalesce(prenom, nullif(trim(prenom_donne), '')),
           nom       = coalesce(nom, upper(nullif(trim(nom_donne), ''))),
           maj_le    = now()
     where id = invit.candidat_id and profil_id is null;
  end if;

  update public.invitation
     set etat = 'acceptee', repondu_le = now(), profil_id = compte
   where id = invit.id;
end;
$$;

revoke all on function public.accepter_invitation(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.accepter_invitation(text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Ma fiche — ce que le candidat lit de son dossier
--    Ce qu'il a lui-même à remplir, et rien de ce que la commission y écrit :
--    ni référent, ni appréciation, ni urgence, ni parrain. Des fichiers, il
--    ne sait que s'ils sont là — leur chemin ne le regarde pas.
-- ---------------------------------------------------------------------------
drop function if exists public.ma_fiche();

create function public.ma_fiche()
returns table (
  id                       uuid,
  numero                   integer,
  nom                      text,
  prenom                   text,
  email                    text,
  telephone                text,
  age                      integer,
  situation_familiale      text,
  adresse                  text,
  code_postal              text,
  ville                    text,
  type_emploi              text,
  emploi_recherche         text,
  definition_emploi        text,
  mobilite_geographique    text,
  debut_stage              timestamptz,
  fin_stage                timestamptz,
  formations               text,
  experiences              text,
  competences              text,
  informatique             text,
  savoir_etre              text,
  centres_interet          text,
  permis_vl                text,
  permis_moto              text,
  permis_pl                text,
  vehicule                 text,
  a_un_cv                  boolean,
  a_une_lettre             boolean,
  candidature_completee_le timestamptz,
  maj_le                   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.nom, c.prenom, c.email, c.telephone, c.age,
         c.situation_familiale, c.adresse, c.code_postal, c.ville,
         c.type_emploi, c.emploi_recherche, c.definition_emploi,
         c.mobilite_geographique, c.debut_stage, c.fin_stage,
         c.formations, c.experiences, c.competences, c.informatique,
         c.savoir_etre, c.centres_interet,
         c.permis_vl, c.permis_moto, c.permis_pl, c.vehicule,
         c.cv_chemin is not null, c.lettre_motivation_chemin is not null,
         c.candidature_completee_le, c.maj_le
    from public.candidat c
    join public.profil p on p.id = c.profil_id
   where c.profil_id = auth.uid()
     and p.role = 'candidat'
   limit 1
$$;

comment on function public.ma_fiche() is
  'La fiche du candidat connecté, et elle seule : ce qu''il remplit lui-même, '
  'sans rien de ce que la commission y écrit.';

revoke all on function public.ma_fiche() from public, anon;
grant execute on function public.ma_fiche() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Modifier ma fiche
--    La fiche entière, à chaque enregistrement, comme le formulaire l'envoie.
--    Une colonne absente de la liste ci-dessous ne se modifie pas, quoi que
--    contienne `fiche`. L'adresse e-mail non plus : c'est celle du compte.
--
--    Le premier enregistrement marque la candidature complétée : le dossier
--    apparaît alors comme tel au poste de travail.
-- ---------------------------------------------------------------------------
create or replace function public.modifier_ma_fiche(fiche jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  le_dossier uuid;
  le_type    text;
  l_age      integer;
  le_debut   date;
  la_fin     date;
begin
  select c.id into le_dossier
    from public.candidat c
    join public.profil p on p.id = c.profil_id
   where c.profil_id = auth.uid()
     and p.role = 'candidat'
     for update of c;

  if le_dossier is null then
    raise exception 'Aucune fiche pour ce compte' using errcode = 'insufficient_privilege';
  end if;

  if fiche is null or jsonb_typeof(fiche) <> 'object' then
    raise exception 'Fiche illisible' using errcode = 'check_violation';
  end if;

  if nullif(btrim(fiche ->> 'nom'), '') is null
     or nullif(btrim(fiche ->> 'prenom'), '') is null then
    raise exception 'Le nom et le prénom sont obligatoires' using errcode = 'check_violation';
  end if;

  le_type := nullif(btrim(fiche ->> 'type_emploi'), '');
  if le_type is not null and not (le_type = any (public.types_de_recherche())) then
    raise exception 'Type de recherche inconnu' using errcode = 'check_violation';
  end if;

  begin
    l_age    := nullif(btrim(fiche ->> 'age'), '')::integer;
    le_debut := nullif(btrim(fiche ->> 'debut_stage'), '')::date;
    la_fin   := nullif(btrim(fiche ->> 'fin_stage'), '')::date;
  exception when invalid_text_representation or numeric_value_out_of_range
              or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Âge ou date illisible' using errcode = 'check_violation';
  end;

  if l_age is not null and (l_age < 14 or l_age > 99) then
    raise exception 'Âge hors bornes' using errcode = 'check_violation';
  end if;

  update public.candidat
     set nom                      = upper(btrim(fiche ->> 'nom')),
         prenom                   = btrim(fiche ->> 'prenom'),
         telephone                = nullif(btrim(fiche ->> 'telephone'), ''),
         age                      = l_age,
         situation_familiale      = nullif(btrim(fiche ->> 'situation_familiale'), ''),
         adresse                  = nullif(btrim(fiche ->> 'adresse'), ''),
         code_postal              = nullif(btrim(fiche ->> 'code_postal'), ''),
         ville                    = nullif(btrim(fiche ->> 'ville'), ''),
         type_emploi              = le_type,
         emploi_recherche         = nullif(btrim(fiche ->> 'emploi_recherche'), ''),
         definition_emploi        = nullif(btrim(fiche ->> 'definition_emploi'), ''),
         mobilite_geographique    = nullif(btrim(fiche ->> 'mobilite_geographique'), ''),
         debut_stage              = le_debut,
         fin_stage                = la_fin,
         formations               = nullif(btrim(fiche ->> 'formations'), ''),
         experiences              = nullif(btrim(fiche ->> 'experiences'), ''),
         competences              = nullif(btrim(fiche ->> 'competences'), ''),
         informatique             = nullif(btrim(fiche ->> 'informatique'), ''),
         savoir_etre              = nullif(btrim(fiche ->> 'savoir_etre'), ''),
         centres_interet          = nullif(btrim(fiche ->> 'centres_interet'), ''),
         permis_vl                = nullif(btrim(fiche ->> 'permis_vl'), ''),
         permis_moto              = nullif(btrim(fiche ->> 'permis_moto'), ''),
         permis_pl                = nullif(btrim(fiche ->> 'permis_pl'), ''),
         vehicule                 = nullif(btrim(fiche ->> 'vehicule'), ''),
         candidature_completee_le = coalesce(candidature_completee_le, now()),
         maj_le                   = now()
   where id = le_dossier;

  return le_dossier;
end;
$$;

comment on function public.modifier_ma_fiche(jsonb) is
  'Le candidat connecté enregistre sa fiche. Seules les colonnes qu''il '
  'remplit lui-même se modifient.';

revoke all on function public.modifier_ma_fiche(jsonb) from public, anon;
grant execute on function public.modifier_ma_fiche(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ranger mon CV, ou ma lettre
--    Le fichier est déposé par la route, sous clé service_role, dans le seau
--    privé. Cette fonction n'enregistre que son chemin, et refuse tout autre
--    chemin que celui de SON dossier : un candidat ne rattache pas à sa fiche
--    le fichier d'un autre. Le CV est un PDF — c'est ce que HERACLES sait
--    lire ; la lettre garde les formats de 0057.
-- ---------------------------------------------------------------------------
create or replace function public.ranger_mon_document(genre text, chemin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  le_dossier uuid;
begin
  select c.id into le_dossier
    from public.candidat c
    join public.profil p on p.id = c.profil_id
   where c.profil_id = auth.uid()
     and p.role = 'candidat';

  if le_dossier is null then
    raise exception 'Aucune fiche pour ce compte' using errcode = 'insufficient_privilege';
  end if;

  if genre = 'cv' then
    if chemin is null or chemin <> ('candidat/cv/' || le_dossier || '.pdf') then
      raise exception 'CV mal rangé' using errcode = 'check_violation';
    end if;
    update public.candidat set cv_chemin = chemin, maj_le = now() where id = le_dossier;
  elsif genre = 'lettre' then
    if chemin is null
       or chemin !~ ('^candidat/lettre/' || le_dossier || '\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
      raise exception 'Lettre mal rangée' using errcode = 'check_violation';
    end if;
    update public.candidat set lettre_motivation_chemin = chemin, maj_le = now() where id = le_dossier;
  else
    raise exception 'Document inconnu' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

comment on function public.ranger_mon_document(text, text) is
  'Le candidat connecté rattache à sa fiche le CV ou la lettre que la route a '
  'déposé — sous le chemin de son dossier, et aucun autre.';

revoke all on function public.ranger_mon_document(text, text) from public, anon;
grant execute on function public.ranger_mon_document(text, text) to authenticated;
