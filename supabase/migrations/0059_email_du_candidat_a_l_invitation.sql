-- ---------------------------------------------------------------------------
-- 0059 — l'e-mail du candidat, dès l'invitation
--
-- Ce que ça change : la fenêtre « Nouveau candidat » demande deux adresses,
-- celle du candidat et celle du parrain. Celle du candidat est gardée avec
-- l'invitation, et le parrain la retrouve pré-remplie dans son formulaire —
-- il peut la corriger s'il en connaît une meilleure.
--
-- POURQUOI ICI, ET PAS DANS LA FICHE
--
-- Le dossier du candidat n'existe pas encore : il s'ouvre quand le parrain
-- le présente (`presenter_un_candidat`, 0057). Jusque-là, l'adresse n'est
-- qu'une suggestion faite au parrain ; c'est ce qu'il envoie qui fait foi, et
-- `presenter_un_candidat` n'a pas à changer.
--
-- FACULTATIVE
--
-- La page `/espace/candidats/nouveau` garde son formulaire à une seule
-- adresse : la colonne accepte `null`, et le troisième paramètre de
-- `inviter_un_parrain` vaut `null` par défaut.
--
-- QUI LA VOIT
--
-- Le parrain seul, par son jeton (`parrainage_par_empreinte`, service_role).
-- `parrainages_de_ma_loge` ne la rend pas : le tableau de suivi n'en a pas
-- besoin, et une coordonnée de plus à l'écran n'est pas une coordonnée utile.
-- ---------------------------------------------------------------------------

-- 1. La colonne ------------------------------------------------------------
alter table public.parrainage
  add column if not exists candidat_email text;

alter table public.parrainage
  drop constraint if exists parrainage_candidat_email_forme;
alter table public.parrainage
  add constraint parrainage_candidat_email_forme
  check (
    candidat_email is null
    or (candidat_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(candidat_email) <= 320)
  );

comment on column public.parrainage.candidat_email is
  'L''adresse du candidat proposée par le référent à l''invitation. Pré-remplit '
  'le formulaire du parrain, qui peut la corriger.';

-- 2. Inviter : un troisième paramètre, facultatif ----------------------------
-- L'ancienne signature disparaît : deux fonctions de même nom dont l'une a un
-- paramètre par défaut rendraient l'appel à deux arguments ambigu.
drop function if exists public.inviter_un_parrain(text, text);

create or replace function public.inviter_un_parrain(
  adresse   text,
  empreinte text,
  candidat  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  moi        uuid := public.referent_courant();
  la_loge    uuid := public.ma_loge();
  propre     text := lower(btrim(coalesce(adresse, '')));
  du_candidat text := nullif(lower(btrim(coalesce(candidat, ''))), '');
  neuf       uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if propre !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(propre) > 320 then
    raise exception 'Adresse email invalide' using errcode = 'invalid_parameter_value';
  end if;

  if du_candidat is not null
     and (du_candidat !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(du_candidat) > 320) then
    raise exception 'Adresse email du candidat invalide'
      using errcode = 'invalid_parameter_value';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  -- Une invitation encore ouverte pour cette adresse laisse la place à la
  -- nouvelle : son lien cesse de valoir.
  update public.parrainage
     set revoque_le = now()
   where loge_id = la_loge
     and lower(parrain_email) = propre
     and presente_le is null
     and revoque_le is null;

  insert into public.parrainage
    (loge_id, envoye_par, parrain_email, candidat_email, jeton_parrain_empreinte)
  values (la_loge, moi, propre, du_candidat, empreinte)
  returning id into neuf;

  return neuf;
end;
$$;

comment on function public.inviter_un_parrain(text, text, text) is
  'Le référent connecté invite un parrain à présenter un candidat dans sa loge, '
  'avec, s''il la connaît, l''adresse du candidat. Une invitation encore ouverte '
  'pour la même adresse de parrain est révoquée.';

revoke all on function public.inviter_un_parrain(text, text, text) from public, anon;
grant execute on function public.inviter_un_parrain(text, text, text) to authenticated;

-- 3. Le lien du parrain rend aussi l'adresse proposée ------------------------
-- Même corps qu'en 0057, une colonne de plus en sortie : le type de retour
-- change, d'où le `drop`.
drop function if exists public.parrainage_par_empreinte(text);

create function public.parrainage_par_empreinte(empreinte text)
returns table (
  id              uuid,
  loge_nom        text,
  envoye_par_nom  text,
  parrain_email   text,
  candidat_email  text,
  valable         boolean,
  motif           text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         l.nom,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         p.parrain_email,
         p.candidat_email,
         p.presente_le is null and p.revoque_le is null and p.parrain_expire_le > now(),
         case
           when p.presente_le is not null      then 'deja_presente'
           when p.revoque_le is not null       then 'revoque'
           when p.parrain_expire_le <= now()   then 'expire'
           else null
         end
    from public.parrainage p
    join public.loge l on l.id = p.loge_id
    left join public.referent r on r.id = p.envoye_par
   where empreinte is not null
     and (p.jeton_parrain_empreinte = empreinte or p.jeton_relance_empreinte = empreinte)
$$;

revoke all on function public.parrainage_par_empreinte(text) from public, anon, authenticated;
grant execute on function public.parrainage_par_empreinte(text) to service_role;
