-- ---------------------------------------------------------------------------
-- 0061 — renvoyer le lien à un candidat sans parrain
--
-- Ce que ça change : le bouton « Renvoyer le lien » d'un dossier ouvert sans
-- parrain (0060) envoie un courriel qui ne parle pas de parrain. Jusqu'ici il
-- commençait par « Votre parrain nous a présenté votre recherche », faux pour
-- ces dossiers-là.
--
-- COMMENT
--
-- `renvoyer_le_lien_du_candidat` (0057) rend désormais `sans_parrain` : vrai
-- quand la ligne de parrainage du candidat ne porte aucune adresse de parrain.
-- La route choisit le courriel d'après ce drapeau. Même signature, mêmes
-- droits, même corps — une clé de plus dans le jsonb rendu.
-- ---------------------------------------------------------------------------

create or replace function public.renvoyer_le_lien_du_candidat(le_candidat uuid, empreinte text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  la_loge      uuid := public.ma_loge();
  fiche        public.candidat%rowtype;
  sans_parrain boolean;
begin
  if public.referent_courant() is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  select * into fiche from public.candidat c where c.id = le_candidat;
  if not found or fiche.loge_id is distinct from la_loge
     or fiche.candidature_completee_le is not null or fiche.email is null then
    return null;
  end if;

  update public.parrainage
     set jeton_candidat_empreinte = empreinte,
         candidat_expire_le       = now() + interval '30 days'
   where candidat_id = le_candidat
     and revoque_le is null;

  if not found then
    return null;
  end if;

  select bool_and(p.parrain_email is null) into sans_parrain
    from public.parrainage p
   where p.candidat_id = le_candidat
     and p.revoque_le is null;

  return jsonb_build_object(
    'email',        fiche.email,
    'prenom',       fiche.prenom,
    'loge_nom',     (select l.nom from public.loge l where l.id = la_loge),
    'sans_parrain', coalesce(sans_parrain, false)
  );
end;
$$;

comment on function public.renvoyer_le_lien_du_candidat(uuid, text) is
  'Un référent de la loge renvoie au candidat un nouveau lien vers sa fiche, '
  'tant qu''il ne l''a pas complétée. Dit aussi si le dossier est sans parrain. '
  'Null quand ce n''est pas possible.';

revoke all on function public.renvoyer_le_lien_du_candidat(uuid, text) from public, anon;
grant execute on function public.renvoyer_le_lien_du_candidat(uuid, text) to authenticated;
