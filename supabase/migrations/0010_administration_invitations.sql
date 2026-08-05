-- 0010_administration_invitations.sql
-- L'écran par lequel un administrateur invite.
--
-- La migration 0009 avait tout fermé : les invitations n'étaient lisibles que
-- sous clé service_role, faute d'écran pour les montrer. L'écran existe
-- maintenant, et il justifie exactement deux ouvertures — pas une de plus :
--
--   * un administrateur lit les invitations, pour voir qui attend ;
--   * un administrateur lit toutes les loges, pour choisir dans laquelle il
--     invite. Un référent, lui, ne voit toujours que la sienne.
--
-- Émettre et révoquer restent des fonctions appelées depuis une route serveur :
-- ce sont des actes, pas des lectures.

-- ---------------------------------------------------------------------------
-- 1. Suis-je administrateur ?
--    `security definer` : la fonction lit `profil` sans repasser par la policy
--    de cette table. Sans cela, une policy qui interroge `profil` déclencherait
--    la policy de `profil`, à chaque ligne examinée.
-- ---------------------------------------------------------------------------
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profil where id = auth.uid() and role = 'admin')
$$;

comment on function public.est_admin() is
  'Vrai si la personne connectée est administrateur. Sert aux policies de l''écran d''administration.';

revoke all on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Lire les invitations — administrateurs seuls
--    `(select public.est_admin())` entre parenthèses : évalué une fois par
--    requête, et non une fois par ligne.
-- ---------------------------------------------------------------------------
grant select on public.invitation to authenticated;

drop policy if exists invitation_lecture_admin on public.invitation;
create policy invitation_lecture_admin on public.invitation
  for select
  to authenticated
  using ((select public.est_admin()));

-- Ni insertion ni modification ni suppression depuis l'application : émettre et
-- révoquer passent par `emettre_invitation` et `refuser_invitation`, qui
-- vérifient elles-mêmes le droit. Une policy d'écriture ici permettrait de
-- fabriquer une invitation sans passer par ces contrôles.

-- ---------------------------------------------------------------------------
-- 3. Lire toutes les loges — administrateurs seuls
--    La policy de la migration 0006 reste : un référent ne voit que sa loge et
--    celles de ses candidats. Celle-ci s'y ajoute, sans l'élargir.
-- ---------------------------------------------------------------------------
drop policy if exists loge_lecture_admin on public.loge;
create policy loge_lecture_admin on public.loge
  for select
  to authenticated
  using ((select public.est_admin()));

-- ---------------------------------------------------------------------------
-- 4. Voir qui a été invité, sans exposer les empreintes
--    Une vue plutôt qu'un accès direct : l'écran a besoin du nom de la loge et
--    de celui qui invite, jamais de `jeton_empreinte`. Ce qui n'est pas montré
--    ne peut pas fuir.
-- ---------------------------------------------------------------------------
create or replace view public.invitation_visible
with (security_invoker = true)
as
  select i.id,
         i.email,
         i.role,
         i.etat,
         i.cree_le,
         i.expire_le,
         i.repondu_le,
         i.expire_le <= now() as perimee,
         l.nom as loge_nom,
         nullif(trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), '') as invite_par_nom
    from public.invitation i
    left join public.loge l on l.id = i.loge_id
    left join public.profil p on p.id = i.invite_par;

comment on view public.invitation_visible is
  'Les invitations telles que l''écran d''administration les affiche. `security_invoker` : la vue obéit à la policy de qui la lit, elle ne la contourne pas.';

grant select on public.invitation_visible to authenticated;
