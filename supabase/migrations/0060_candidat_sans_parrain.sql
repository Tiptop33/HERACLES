-- ---------------------------------------------------------------------------
-- 0060 — un nouveau candidat, sans parrain
--
-- Ce que ça change : dans la fenêtre « Nouveau candidat », les deux adresses
-- deviennent facultatives — l'une ou l'autre suffit. Avec la seule adresse du
-- candidat, le dossier s'ouvre tout de suite dans la loge du référent, et le
-- candidat reçoit directement le lien vers sa fiche. Personne ne le présente.
--
-- POURQUOI PASSER QUAND MÊME PAR `parrainage`
--
-- Le lien du candidat vit dans `parrainage` (0057) : `candidature_par_empreinte`,
-- `completer_sa_candidature` et `renvoyer_le_lien_du_candidat` le cherchent là.
-- Une ligne de parrainage sans parrain — déjà « présentée » à sa création —
-- garde ces trois fonctions telles quelles, et le dossier apparaît dans le
-- tableau de suivi, à l'état « Attend le candidat ».
--
-- Ce que cela demande : `parrain_email` et `jeton_parrain_empreinte` acceptent
-- `null`. Une contrainte garde l'essentiel — chaque ligne désigne quelqu'un,
-- le parrain ou le candidat.
--
-- Ce que cela ne touche pas : `parrainages_a_relancer` ne retient que les
-- lignes non présentées, donc jamais celles-ci ; `presenter_un_candidat`
-- cherche par empreinte, et `null` n'égale rien.
-- ---------------------------------------------------------------------------

-- 1. Une ligne sans parrain ------------------------------------------------
alter table public.parrainage alter column parrain_email drop not null;
alter table public.parrainage alter column jeton_parrain_empreinte drop not null;

alter table public.parrainage
  drop constraint if exists parrainage_designe_quelquun;
alter table public.parrainage
  add constraint parrainage_designe_quelquun
  check (
    (parrain_email is not null and jeton_parrain_empreinte is not null)
    or (parrain_email is null and candidat_id is not null)
  );

-- 2. Ouvrir le dossier, et rendre au candidat son lien --------------------
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
  dernier     integer;
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

  -- Le numéro, exactement comme `presenter_un_candidat` (0057) : le plus
  -- grand du compteur et du plus haut numéro porté, plus un, la loge
  -- verrouillée jusqu'à la fin de la transaction.
  select l.prochain_numero_candidat, l.nom into dernier, la_loge_nom
    from public.loge l
   where l.id = la_loge
     for update;

  select greatest(coalesce(dernier, 0), coalesce(max(c.numero), 0)) + 1
    into le_numero
    from public.candidat c
   where c.loge_id = la_loge;

  update public.loge set prochain_numero_candidat = le_numero where id = la_loge;

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

comment on function public.inviter_un_candidat(text, text) is
  'Le référent connecté ouvre un dossier sans parrain : le candidat est créé '
  'dans sa loge, avec le numéro suivant et sans référent, et son lien est '
  'enregistré (empreinte seulement).';

revoke all on function public.inviter_un_candidat(text, text) from public, anon;
grant execute on function public.inviter_un_candidat(text, text) to authenticated;
