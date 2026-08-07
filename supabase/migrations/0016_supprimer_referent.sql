-- ---------------------------------------------------------------------------
-- 0016 — supprimer la fiche d'un référent
--
-- Ce que ça change : un administrateur peut retirer une fiche de l'annuaire.
-- La reprise Bubble en a laissé des doublons — deux fiches pour une personne —
-- et rien ne permettait de les enlever.
--
-- Ceci revient sur une décision de la migration 0012, qui n'avait posé aucune
-- policy de suppression : « un dossier ne perd pas son référent par un clic ».
-- Cette phrase reste vraie, et c'est pourquoi la suppression ne passe pas par
-- une policy mais par une fonction qui refuse trois fois :
--
--   * à qui n'est pas administrateur ;
--   * sur sa propre fiche — se retirer soi-même de l'annuaire, c'est perdre sa
--     loge et ses candidats dans le même geste, sans personne pour le défaire ;
--   * sur une fiche qui accompagne des candidats. Ceux-là se retrouveraient
--     sans référent, silencieusement. Il faut les confier à quelqu'un d'abord.
--
-- La table reste donc fermée : aucune policy `for delete` n'est ajoutée, et un
-- `delete from public.referent` reste sans effet pour tout le monde. Il n'y a
-- qu'une porte, et elle est gardée.
-- ---------------------------------------------------------------------------

create or replace function public.supprimer_referent(cible uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche  public.referent%rowtype;
  suivis integer;
begin
  if not public.est_admin() then
    raise exception 'Seul un administrateur peut supprimer une fiche'
      using errcode = 'insufficient_privilege';
  end if;

  select * into fiche from public.referent r where r.id = cible;
  if not found then
    raise exception 'Cette fiche n''existe plus' using errcode = 'no_data_found';
  end if;

  if fiche.profil_id is not null and fiche.profil_id = auth.uid() then
    raise exception 'On ne retire pas sa propre fiche' using errcode = 'check_violation';
  end if;

  -- Référent ou parrain, dossiers clôturés compris : un dossier clos garde son
  -- histoire, et cette histoire nomme quelqu'un.
  select count(*) into suivis
    from public.candidat c
   where c.referent_id = cible or c.parrain_id = cible;

  if suivis > 0 then
    raise exception 'Cette fiche accompagne encore % candidat(s)', suivis
      using errcode = 'restrict_violation';
  end if;

  delete from public.referent r where r.id = cible;
end;
$$;

comment on function public.supprimer_referent(uuid) is
  'Retire une fiche de référent. Refuse à qui n''est pas administrateur, sur '
  'sa propre fiche, et sur une fiche qui accompagne des candidats. La table '
  'n''a toujours aucune policy de suppression : c''est la seule porte.';

revoke all on function public.supprimer_referent(uuid) from public, anon;
grant execute on function public.supprimer_referent(uuid) to authenticated;
