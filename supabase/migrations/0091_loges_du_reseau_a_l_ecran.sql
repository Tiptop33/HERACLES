-- ---------------------------------------------------------------------------
-- 0091 — les loges du réseau, à l'écran
--
-- Ce que ça change : deux écrans validés le 13 novembre 2026
-- (docs/maquettes/loges-du-reseau.html) prennent appui sur la base.
--
--   1. La page du Secrétaire : ouverte par son lien personnel, sans compte, il
--      y coche les secteurs d'activité de sa loge du réseau.
--   2. Paramètres › Loges du réseau : l'administration saisit les 73 loges,
--      envoie les liens, suit les réponses, règle le courriel.
--
-- QUI FAIT QUOI
--
--   · L'ADMINISTRATION seule voit et modifie la liste des loges du réseau, et
--     le nom et l'adresse de leurs Secrétaires (§ 3 bis du registre RGPD).
--   · LE SECRÉTAIRE ne voit, par son lien, que sa propre loge : son nom, son
--     numéro, sa province, son propre nom, et les secteurs cochés. Jamais son
--     adresse, jamais une autre loge.
--   · PERSONNE d'autre : ni les référents, ni les candidats.
--
-- LE LIEN
--
-- Le lien porte un jeton tiré au hasard par le serveur web (32 octets,
-- `fabriquerJeton`) ; la base n'en reçoit et n'en garde que l'empreinte
-- SHA-256 (0089). Même chemin que les liens du parrain et du candidat (0057) :
-- la route web vérifie que le jeton est plausible, le hache, puis appelle ces
-- fonctions avec la clé de service — elles ne sont exécutables par personne
-- d'autre. C'est la base qui dit si le lien vaut : loge trouvée, date de fin
-- pas passée. Un lien qui ne vaut plus se refuse comme ailleurs (SQLSTATE
-- 28000), une empreinte mal formée aussi (22023).
--
-- Le lien d'une loge n'est posé qu'une fois le courriel parti
-- (`poser_le_lien_de_la_loge_du_reseau`) : si l'envoi échoue, l'ancien lien du
-- Secrétaire vaut encore, et l'écran ne dit pas « envoyé » à tort.
--
-- POURQUOI DES FONCTIONS ET NON DES POLICIES
--
-- Même dessin que l'annuaire (0012) et la fiche (0020) : les tables restent
-- fermées (0086, 0089), chaque fonction rend exactement ce que l'écran
-- affiche. Aucun GRANT de table : la liste que garde le test 0007 ne bouge
-- pas.
--
-- Une première version de cette migration, jamais déployée, donnait ces
-- droits au « Secrétaire » de chacune des 3 loges de HERACLES : c'était la
-- confusion que le 13 novembre a levée.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Le courriel envoyé aux Secrétaires — réglable (décision 27)
-- ===========================================================================
-- Une première version, à reprendre dans Paramètres. Les variables entre
-- accolades sont remplacées à l'envoi : {secretaire}, {loge}, {lien},
-- {expiration}.
alter table public.parametre
  add column if not exists objet_loge_du_reseau text not null
    default 'HERACLES — les secteurs d''activité de votre loge';

alter table public.parametre
  add column if not exists mot_loge_du_reseau text not null default $texte$Bonjour {secretaire},

HERACLES accompagne des candidats en recherche d'emploi, d'alternance ou de stage. Pour orienter chacun vers les loges qui peuvent l'aider, nous demandons à chaque loge du réseau d'indiquer les secteurs d'activité où travaillent ses membres — sans nom ni nombre.

Pour la loge {loge}, il suffit de cocher ces secteurs sur cette page :
{lien}

Ce lien vous est personnel. Vous pouvez y revenir pour compléter ou corriger la liste jusqu'au {expiration}.

Merci de votre aide,
L'équipe HERACLES$texte$;

comment on column public.parametre.objet_loge_du_reseau is
  'Objet du courriel qui porte son lien au Secrétaire d''une loge du réseau.';
comment on column public.parametre.mot_loge_du_reseau is
  'Texte de ce courriel. Variables : {secretaire}, {loge}, {lien}, {expiration}.';

-- ===========================================================================
-- 2. L'administration : Paramètres › Loges du réseau
-- ===========================================================================

-- Une empreinte de lien a la forme d'un SHA-256 en hexadécimal, ou elle est
-- refusée avant toute lecture.
create or replace function public.exiger_une_empreinte(empreinte text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de lien invalide' using errcode = 'invalid_parameter_value';
  end if;
end
$$;

revoke all on function public.exiger_une_empreinte(text) from public, anon, authenticated;
grant execute on function public.exiger_une_empreinte(text) to service_role;

-- La liste, telle que la rubrique l'affiche — jamais l'empreinte du lien.
-- Rangée par numéro : un numéro de loge se lit comme un nombre quand c'en est
-- un, et les loges sans numéro viennent à la fin.
create or replace function public.lister_loges_du_reseau()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Les loges du réseau se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',               l.id,
             'nom',              l.nom,
             'numero',           l.numero,
             'province_id',      l.province_id,
             'province',         p.nom,
             'secretaire_nom',   l.secretaire_nom,
             'secretaire_email', l.secretaire_email,
             'a_un_ecusson',     l.ecusson_chemin is not null,
             'lien_envoye_le',   l.lien_envoye_le,
             'lien_expire_le',   l.lien_expire_le,
             'secteurs_maj_le',  l.secteurs_maj_le,
             'secteurs', coalesce((
               select jsonb_agg(jsonb_build_object('code', c.code, 'intitule', c.intitule) order by c.code)
                 from public.loge_du_reseau_secteur s
                 join public.code_naf c on c.code = s.code
                where s.loge_du_reseau_id = l.id), '[]'::jsonb))
           order by (substring(l.numero from '^[0-9]{1,9}'))::integer nulls last, l.numero, l.nom)
      from public.loge_du_reseau l
      left join public.province p on p.id = l.province_id), '[]'::jsonb);
end
$$;

comment on function public.lister_loges_du_reseau() is
  'Les loges du réseau pour Paramètres › Loges du réseau : champs, état du lien, '
  'secteurs cochés. Jamais l''empreinte du lien. Réservée à l''administration.';

revoke all on function public.lister_loges_du_reseau() from public, anon;
grant execute on function public.lister_loges_du_reseau() to authenticated, service_role;

-- Ajouter (la_loge vide) ou corriger une loge du réseau. Les cinq champs
-- arrivent ensemble : l'écran enregistre chaque changement aussitôt, en
-- renvoyant la fiche entière. Changer l'adresse n'envoie rien.
create or replace function public.enregistrer_loge_du_reseau(
  la_loge uuid,
  le_nom text,
  le_numero text,
  la_province uuid,
  le_secretaire text,
  l_adresse text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid;
begin
  if not public.est_admin() then
    raise exception 'Les loges du réseau se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;

  if la_loge is null then
    insert into public.loge_du_reseau (nom, numero, province_id, secretaire_nom, secretaire_email)
    values (btrim(le_nom), nullif(btrim(le_numero), ''), la_province,
            nullif(btrim(le_secretaire), ''), nullif(lower(btrim(l_adresse)), ''))
    returning id into cible;
  else
    update public.loge_du_reseau
       set nom              = btrim(le_nom),
           numero           = nullif(btrim(le_numero), ''),
           province_id      = la_province,
           secretaire_nom   = nullif(btrim(le_secretaire), ''),
           secretaire_email = nullif(lower(btrim(l_adresse)), '')
     where id = la_loge
    returning id into cible;
    if cible is null then
      raise exception 'Cette loge du réseau n''existe plus' using errcode = 'no_data_found';
    end if;
  end if;
  return cible;
end
$$;

comment on function public.enregistrer_loge_du_reseau(uuid, text, text, uuid, text, text) is
  'Ajoute (la_loge vide) ou corrige une loge du réseau. Réservée à '
  'l''administration. Ne touche pas au lien.';

revoke all on function public.enregistrer_loge_du_reseau(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.enregistrer_loge_du_reseau(uuid, text, text, uuid, text, text) to authenticated, service_role;

-- Retirer une loge du réseau : ses secteurs partent avec elle (0089). Rend le
-- chemin de son écusson, que la route efface du seau — SQL n'atteint pas le
-- stockage.
create or replace function public.retirer_loge_du_reseau(la_loge uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ecusson text;
begin
  if not public.est_admin() then
    raise exception 'Les loges du réseau se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.loge_du_reseau where id = la_loge returning ecusson_chemin into ecusson;
  return ecusson;
end
$$;

revoke all on function public.retirer_loge_du_reseau(uuid) from public, anon;
grant execute on function public.retirer_loge_du_reseau(uuid) to authenticated, service_role;

-- Poser le lien d'une loge du réseau, une fois le courriel parti. Le nouveau
-- lien remplace l'ancien, qui cesse aussitôt de valoir (décision 22). Rend
-- la date de fin, pour que l'écran l'affiche.
create or replace function public.poser_le_lien_de_la_loge_du_reseau(la_loge uuid, empreinte text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  fin timestamptz;
begin
  if not public.est_admin() then
    raise exception 'Les liens se donnent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  perform public.exiger_une_empreinte(empreinte);

  update public.loge_du_reseau
     set lien_empreinte = empreinte,
         lien_envoye_le = now(),
         lien_expire_le = now() + interval '90 days'
   where id = la_loge
  returning lien_expire_le into fin;
  if fin is null then
    raise exception 'Cette loge du réseau n''existe plus' using errcode = 'no_data_found';
  end if;
  return fin;
end
$$;

comment on function public.poser_le_lien_de_la_loge_du_reseau(uuid, text) is
  'Enregistre l''empreinte du nouveau lien d''une loge du réseau, valable 90 '
  'jours ; l''ancien cesse de valoir. Réservée à l''administration.';

revoke all on function public.poser_le_lien_de_la_loge_du_reseau(uuid, text) from public, anon;
grant execute on function public.poser_le_lien_de_la_loge_du_reseau(uuid, text) to authenticated, service_role;

-- L'écusson : le poser, le lire. Le fichier est déposé dans le seau par la
-- route web ; la base garde son chemin, que la contrainte de 0089 oblige à se
-- déduire de la loge. Poser rend l'ancien chemin, pour que la route efface
-- l'ancien fichier s'il portait un autre nom.
create or replace function public.poser_l_ecusson_de_la_loge_du_reseau(la_loge uuid, chemin text)
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
  select l.ecusson_chemin, true into ancien, trouve
    from public.loge_du_reseau l where l.id = la_loge for update;
  if not coalesce(trouve, false) then
    raise exception 'Cette loge du réseau n''existe plus' using errcode = 'no_data_found';
  end if;
  update public.loge_du_reseau set ecusson_chemin = chemin where id = la_loge;
  return ancien;
end
$$;

revoke all on function public.poser_l_ecusson_de_la_loge_du_reseau(uuid, text) from public, anon;
grant execute on function public.poser_l_ecusson_de_la_loge_du_reseau(uuid, text) to authenticated, service_role;

create or replace function public.ecusson_de_la_loge_du_reseau(la_loge uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Les loges du réseau se gèrent par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  return (select l.ecusson_chemin from public.loge_du_reseau l where l.id = la_loge);
end
$$;

revoke all on function public.ecusson_de_la_loge_du_reseau(uuid) from public, anon;
grant execute on function public.ecusson_de_la_loge_du_reseau(uuid) to authenticated, service_role;

-- Le courriel : le lire, le régler.
create or replace function public.courriel_des_loges_du_reseau()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Le courriel des loges du réseau se règle par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  -- Sur une base neuve, la ligne unique des paramètres peut manquer : on la
  -- pose, et les valeurs par défaut des colonnes — la première version du
  -- courriel — y prennent place. Même geste que `regler_l_exercice` (0044).
  insert into public.parametre (id) values (true) on conflict (id) do nothing;
  return (select jsonb_build_object('objet', p.objet_loge_du_reseau, 'texte', p.mot_loge_du_reseau)
            from public.parametre p where p.id);
end
$$;

revoke all on function public.courriel_des_loges_du_reseau() from public, anon;
grant execute on function public.courriel_des_loges_du_reseau() to authenticated, service_role;

create or replace function public.regler_le_courriel_des_loges_du_reseau(l_objet text, le_texte text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Le courriel des loges du réseau se règle par l''administration'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(l_objet, '')) = '' or btrim(coalesce(le_texte, '')) = '' then
    raise exception 'L''objet et le texte ne peuvent pas être vides' using errcode = 'check_violation';
  end if;
  if position('{lien}' in le_texte) = 0 then
    raise exception 'Le texte doit garder {lien} : sans lui, le Secrétaire ne reçoit rien à ouvrir'
      using errcode = 'check_violation';
  end if;

  insert into public.parametre (id, objet_loge_du_reseau, mot_loge_du_reseau)
  values (true, btrim(l_objet), le_texte)
  on conflict (id) do update
    set objet_loge_du_reseau = excluded.objet_loge_du_reseau,
        mot_loge_du_reseau   = excluded.mot_loge_du_reseau;

  return public.courriel_des_loges_du_reseau();
end
$$;

revoke all on function public.regler_le_courriel_des_loges_du_reseau(text, text) from public, anon;
grant execute on function public.regler_le_courriel_des_loges_du_reseau(text, text) to authenticated, service_role;

-- ===========================================================================
-- 3. Le Secrétaire, par son lien
-- ===========================================================================

-- La loge que désigne une empreinte, si le lien vaut encore.
create or replace function public.loge_du_reseau_du_lien(empreinte text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exiger_une_empreinte(empreinte);
  return (select l.id from public.loge_du_reseau l
           where l.lien_empreinte = empreinte
             and l.lien_expire_le > now());
end
$$;

revoke all on function public.loge_du_reseau_du_lien(text) from public, anon, authenticated;
grant execute on function public.loge_du_reseau_du_lien(text) to service_role;

-- Ce que la page du Secrétaire affiche. Trois réponses :
--   · { "etat": "valable", … } — la loge, son Secrétaire, la date de fin du
--     lien, la date de la liste et les secteurs cochés ;
--   · { "etat": "expire" } — le lien a existé mais ne vaut plus, ou il a été
--     remplacé : l'écran du lien expiré ;
--   · null — aucune loge ne porte cette empreinte.
-- « Remplacé » et « inconnu » se confondent forcément : l'ancienne empreinte
-- n'est plus nulle part. L'écran dit la même chose dans les deux cas.
create or replace function public.page_de_la_loge_du_reseau(empreinte text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exiger_une_empreinte(empreinte);
  return (select case
    when l.id is null then null
    when l.lien_expire_le <= now() then jsonb_build_object('etat', 'expire')
    else jsonb_build_object(
      'etat',           'valable',
      'nom',            l.nom,
      'numero',         l.numero,
      'province',       p.nom,
      'secretaire_nom', l.secretaire_nom,
      'a_un_ecusson',   l.ecusson_chemin is not null,
      'expire_le',      l.lien_expire_le,
      'liste', jsonb_build_object(
        'maj_le',     l.secteurs_maj_le,
        'modifiable', true,
        'secteurs',   coalesce((
          select jsonb_agg(jsonb_build_object(
                   'code',              c.code,
                   'intitule',          c.intitule,
                   'niveau',            c.niveau,
                   'division',          d.code,
                   'division_intitule', d.intitule,
                   'section',           s.code,
                   'section_intitule',  s.intitule)
                 order by c.code)
            from public.loge_du_reseau_secteur ls
            join public.code_naf c on c.code = ls.code
            join public.code_naf d on d.code = left(c.code, 2)
            join public.code_naf s on s.code = d.parent
           where ls.loge_du_reseau_id = l.id), '[]'::jsonb)))
  end
  from (select 1) as un
  left join public.loge_du_reseau l on l.lien_empreinte = empreinte
  left join public.province p on p.id = l.province_id);
end
$$;

comment on function public.page_de_la_loge_du_reseau(text) is
  'Ce que la page du Secrétaire affiche, pour l''empreinte de son lien : la '
  'loge et ses secteurs si le lien vaut, « expire » sinon, null pour une '
  'empreinte inconnue. Jamais l''adresse du Secrétaire.';

revoke all on function public.page_de_la_loge_du_reseau(text) from public, anon, authenticated;
grant execute on function public.page_de_la_loge_du_reseau(text) to service_role;

-- Cocher, décocher, par le lien. Rend la liste à jour. Cocher deux fois, ou
-- décocher ce qui ne l'est pas, ne change rien et ne fait pas d'erreur.
create or replace function public.cocher_par_le_lien(empreinte text, le_code text, coche boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  la_loge uuid := public.loge_du_reseau_du_lien(empreinte);
begin
  if la_loge is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  if coche then
    insert into public.loge_du_reseau_secteur (loge_du_reseau_id, code)
    values (la_loge, le_code)
    on conflict (loge_du_reseau_id, code) do nothing;
  else
    delete from public.loge_du_reseau_secteur where loge_du_reseau_id = la_loge and code = le_code;
  end if;

  return public.page_de_la_loge_du_reseau(empreinte) -> 'liste';
end
$$;

comment on function public.cocher_par_le_lien(text, text, boolean) is
  'Coche (ou décoche) un secteur pour la loge du réseau que désigne le lien, '
  'puis rend la liste à jour. Refusé si le lien ne vaut plus.';

revoke all on function public.cocher_par_le_lien(text, text, boolean) from public, anon, authenticated;
grant execute on function public.cocher_par_le_lien(text, text, boolean) to service_role;

-- Chercher un secteur, par le lien : la recherche de 0090 en mode précis.
create or replace function public.rechercher_secteur_par_le_lien(empreinte text, recherche text)
returns table (code text, intitule text, niveau text, section text, section_intitule text, rang integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.loge_du_reseau_du_lien(empreinte) is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  return query select * from public.rechercher_secteur(left(recherche, 120), true);
end
$$;

revoke all on function public.rechercher_secteur_par_le_lien(text, text) from public, anon, authenticated;
grant execute on function public.rechercher_secteur_par_le_lien(text, text) to service_role;

-- Toute la nomenclature, par le lien, pour l'arborescence à cocher : une liste
-- compacte [code, intitulé, niveau 1 à 5, parent], chargée d'un coup.
create or replace function public.nomenclature_par_le_lien(empreinte text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.loge_du_reseau_du_lien(empreinte) is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  return (
    select jsonb_agg(jsonb_build_array(
             n.code, n.intitule,
             case n.niveau when 'section' then 1 when 'division' then 2
                           when 'groupe' then 3 when 'classe' then 4 else 5 end,
             n.parent)
           order by n.code)
      from public.code_naf n);
end
$$;

revoke all on function public.nomenclature_par_le_lien(text) from public, anon, authenticated;
grant execute on function public.nomenclature_par_le_lien(text) to service_role;

-- L'écusson de la loge, par le lien : son chemin dans le seau, pour que la
-- route en serve les octets en tête de la page du Secrétaire.
create or replace function public.ecusson_par_le_lien(empreinte text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  la_loge uuid := public.loge_du_reseau_du_lien(empreinte);
begin
  if la_loge is null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;
  return (select l.ecusson_chemin from public.loge_du_reseau l where l.id = la_loge);
end
$$;

revoke all on function public.ecusson_par_le_lien(text) from public, anon, authenticated;
grant execute on function public.ecusson_par_le_lien(text) to service_role;
