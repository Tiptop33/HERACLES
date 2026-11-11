-- ---------------------------------------------------------------------------
-- 0083 — le numéro du candidat suit le dernier dossier
--
-- Ce que ça change : un nouveau candidat reçoit le plus haut numéro porté dans
-- sa loge, plus un — et rien d'autre n'entre dans le calcul. Si le dernier
-- dossier porte le 860, le suivant reçoit le 861. Si l'on supprime ce 861
-- (un essai, un doublon), le candidat d'après reçoit de nouveau le 861.
--
-- POURQUOI
--
-- Jusqu'ici (0057, 0060) le numéro était le plus grand de deux valeurs : le
-- plus haut numéro porté, et le compteur `loge.prochain_numero_candidat`. Le
-- compteur ne redescendait jamais : chaque dossier d'essai créé puis supprimé
-- laissait un trou définitif dans la suite, et il fallait une commande sur le
-- serveur pour y revenir. La suite des numéros se lit sur les comptes rendus
-- et les affichettes ; elle doit suivre les dossiers qui existent.
--
-- CE QUE CELA COÛTE, ET QU'ON ACCEPTE
--
-- Le numéro d'un dossier supprimé est redonné — mais seulement s'il était le
-- dernier de sa loge. Un dossier supprimé au milieu de la suite laisse son
-- trou : on ne renumérote personne. Les dossiers venus de Bubble ne se
-- suppriment pas (0062), et les dossiers clos ou archivés restent dans
-- `candidat` : leurs numéros ne reviennent jamais.
--
-- Une loge sans aucun dossier commence à 1, quoi que dise son compteur.
--
-- CE QUI NE CHANGE PAS
--
--   * Le verrou. La ligne de la loge est prise `for update` jusqu'à la fin de
--     la transaction : deux dossiers ouverts au même instant dans la même loge
--     ne reçoivent pas le même numéro.
--   * `loge.prochain_numero_candidat` reste écrit à chaque dossier ouvert. Il
--     garde le sens qu'il a chez Bubble — le DERNIER numéro donné — mais plus
--     personne ne le lit pour numéroter.
--   * Le numéro d'un dossier ne se modifie pas après coup (0006, 0057, 0063).
--
-- Les deux fonctions qui ouvrent un dossier sont reprises telles quelles de
-- 0057 et de 0060 : seul le calcul du numéro change, et il n'est plus écrit
-- qu'à un endroit.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le calcul, à un seul endroit
-- ---------------------------------------------------------------------------
create or replace function public.numero_du_prochain_candidat(la_loge uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  le_numero integer;
begin
  -- Le verrou d'abord, le calcul ensuite : une seconde ouverture de dossier
  -- dans la même loge attend ici, et lit le numéro que la première a posé.
  perform 1 from public.loge l where l.id = la_loge for update;

  select coalesce(max(c.numero), 0) + 1
    into le_numero
    from public.candidat c
   where c.loge_id = la_loge;

  update public.loge set prochain_numero_candidat = le_numero where id = la_loge;

  return le_numero;
end;
$$;

comment on function public.numero_du_prochain_candidat(uuid) is
  'Le numéro du prochain candidat d''une loge : le plus haut numéro porté, '
  'plus un. Verrouille la loge jusqu''à la fin de la transaction. Réservée aux '
  'fonctions qui ouvrent un dossier.';

-- Personne ne l'appelle directement : elle verrouille une loge et en écrit le
-- compteur. Les deux fonctions ci-dessous, `security definer`, y ont accès par
-- leur propriétaire.
revoke all on function public.numero_du_prochain_candidat(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Le parrain présente le candidat (0057)
-- ---------------------------------------------------------------------------
create or replace function public.presenter_un_candidat(empreinte text, fiche jsonb, empreinte_candidat text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  le_parrainage public.parrainage%rowtype;
  le_type       text;
  l_urgence     smallint;
  le_numero     integer;
  le_parrain    uuid;
  neuf          uuid;
  la_loge_nom   text;
begin
  if fiche is null or jsonb_typeof(fiche) <> 'object' then
    raise exception 'Fiche illisible' using errcode = 'check_violation';
  end if;

  if empreinte_candidat is null or empreinte_candidat !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  -- `for update` : deux envois du même formulaire — un double clic, deux
  -- onglets — attendent l'un l'autre, et le second trouve le lien déjà servi.
  select * into le_parrainage
    from public.parrainage p
   where empreinte is not null
     and (p.jeton_parrain_empreinte = empreinte or p.jeton_relance_empreinte = empreinte)
     for update;

  if not found
     or le_parrainage.presente_le is not null
     or le_parrainage.revoque_le is not null
     or le_parrainage.parrain_expire_le <= now() then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  -- Ce sans quoi le dossier ne désigne personne, ou ne se range nulle part.
  if nullif(btrim(fiche ->> 'candidat_nom'), '') is null
     or nullif(btrim(fiche ->> 'candidat_prenom'), '') is null
     or nullif(btrim(fiche ->> 'candidat_email'), '') is null
     or nullif(btrim(fiche ->> 'parrain_nom'), '') is null then
    raise exception 'Champs obligatoires manquants' using errcode = 'check_violation';
  end if;

  le_type := nullif(btrim(fiche ->> 'type_emploi'), '');
  if le_type is null or not (le_type = any (public.types_de_recherche())) then
    raise exception 'Type de recherche inconnu' using errcode = 'check_violation';
  end if;

  begin
    l_urgence := nullif(btrim(fiche ->> 'urgence'), '')::smallint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Urgence illisible' using errcode = 'check_violation';
  end;

  -- Le numéro : le plus haut porté dans la loge, plus un (voir l'en-tête).
  le_numero := public.numero_du_prochain_candidat(le_parrainage.loge_id);
  select l.nom into la_loge_nom from public.loge l where l.id = le_parrainage.loge_id;

  -- Le parrain est peut-être déjà dans HERACLES, sous l'adresse à laquelle il
  -- a reçu le lien — et non sous celle qu'il a tapée, qui ne prouve rien. Il
  -- devient alors parrain du dossier au sens de 0006 : il le lit et le corrige.
  select r.id into le_parrain
    from public.referent r
   where r.email is not null
     and lower(btrim(r.email)) = le_parrainage.parrain_email
   order by r.cree_le, r.id
   limit 1;

  insert into public.candidat (
    numero, loge_id, referent_id, parrain_id, parrain_email,
    nom, prenom, email, type_emploi,
    lien_parente, connait_appartenance, peut_se_devoiler, urgence, urgence_motif
  ) values (
    le_numero, le_parrainage.loge_id, null, le_parrain, le_parrainage.parrain_email,
    upper(btrim(fiche ->> 'candidat_nom')),
    btrim(fiche ->> 'candidat_prenom'),
    lower(btrim(fiche ->> 'candidat_email')),
    le_type,
    nullif(btrim(fiche ->> 'lien_parente'), ''),
    nullif(btrim(fiche ->> 'connait_appartenance'), ''),
    nullif(btrim(fiche ->> 'peut_se_devoiler'), ''),
    l_urgence,
    nullif(btrim(fiche ->> 'urgence_motif'), '')
  )
  returning id into neuf;

  update public.parrainage
     set parrain_nom              = upper(btrim(fiche ->> 'parrain_nom')),
         parrain_prenom           = nullif(btrim(fiche ->> 'parrain_prenom'), ''),
         parrain_telephone        = nullif(btrim(fiche ->> 'parrain_telephone'), ''),
         parrain_loge             = nullif(btrim(fiche ->> 'parrain_loge'), ''),
         presente_le              = now(),
         candidat_id              = neuf,
         jeton_candidat_empreinte = empreinte_candidat,
         candidat_expire_le       = now() + interval '30 days'
   where id = le_parrainage.id;

  return jsonb_build_object(
    'candidat_id', neuf,
    'numero',      le_numero,
    'loge_nom',    la_loge_nom
  );
end;
$$;

revoke all on function public.presenter_un_candidat(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.presenter_un_candidat(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Le référent ouvre un dossier sans parrain (0060)
-- ---------------------------------------------------------------------------
create or replace function public.inviter_un_candidat(adresse text, empreinte text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moi         uuid := public.referent_courant();
  la_loge     uuid := public.ma_loge();
  propre      text := lower(btrim(coalesce(adresse, '')));
  le_numero   integer;
  la_loge_nom text;
  neuf        uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if propre !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(propre) > 320 then
    raise exception 'Adresse email invalide' using errcode = 'invalid_parameter_value';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  -- Le numéro, exactement comme `presenter_un_candidat`.
  le_numero := public.numero_du_prochain_candidat(la_loge);
  select l.nom into la_loge_nom from public.loge l where l.id = la_loge;

  insert into public.candidat (numero, loge_id, referent_id, parrain_id, email)
  values (le_numero, la_loge, null, null, propre)
  returning id into neuf;

  insert into public.parrainage (
    loge_id, envoye_par, parrain_email, candidat_email, jeton_parrain_empreinte,
    parrain_expire_le, presente_le, candidat_id, jeton_candidat_empreinte, candidat_expire_le
  ) values (
    la_loge, moi, null, propre, null,
    now(), now(), neuf, empreinte, now() + interval '30 days'
  );

  return jsonb_build_object(
    'candidat_id', neuf,
    'numero',      le_numero,
    'loge_nom',    la_loge_nom
  );
end;
$$;

revoke all on function public.inviter_un_candidat(text, text) from public, anon;
grant execute on function public.inviter_un_candidat(text, text) to authenticated;
