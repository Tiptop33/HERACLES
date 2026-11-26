-- ---------------------------------------------------------------------------
-- 0111 — les connexions d'un seul référent
--
-- Ce que ça change : dans Admin › Connexions, l'administrateur choisit un
-- référent et ne voit plus que ses connexions. Demandé le 26 novembre 2026.
--
-- POURQUOI EN BASE
--
-- Le tableau ne rend que les 500 connexions les plus récentes (0110). Filtrer
-- dans la page reviendrait à chercher un référent parmi ces 500-là seulement :
-- quelqu'un qui s'est connecté il y a trois mois semblerait ne s'être jamais
-- connecté. Le filtre passe donc avant la limite.
--
-- CE QUI CHANGE
--
--   · `les_connexions_des_referents(limite, referent)` reçoit un second
--     paramètre, facultatif. Nul : toutes les connexions, comme avant.
--     L'ancienne forme à un seul paramètre est retirée — deux fonctions du
--     même nom rendraient l'appel ambigu. 0110, rejouée à chaque déploiement,
--     la recrée ; cette migration, qui la suit, la retire de nouveau.
--   · `les_referents_du_journal()` rend les référents qui ont au moins une
--     connexion au journal : la liste du menu. Un référent jamais connecté n'y
--     figure pas — le choisir ne montrerait rien.
--
-- Les deux ne rendent rien à qui n'est pas administrateur, comme en 0110.
--
-- Rejouable : `drop function if exists`, `create or replace`.
-- ---------------------------------------------------------------------------

drop function if exists public.les_connexions_des_referents(integer);

create or replace function public.les_connexions_des_referents(
  limite   integer default 500,
  referent uuid default null
)
returns table (
  id             uuid,
  referent_id    uuid,
  nom            text,
  prenom         text,
  loge_nom       text,
  debut          timestamptz,
  fin            timestamptz,
  duree_secondes integer,
  en_cours       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.referent_id,
         r.nom,
         r.prenom,
         l.nom,
         c.debut,
         coalesce(c.deconnecte_le, c.dernier_signe),
         extract(epoch from coalesce(c.deconnecte_le, c.dernier_signe) - c.debut)::integer,
         -- La même règle que « qui est là » (0058) : deux minutes.
         c.deconnecte_le is null and c.dernier_signe > now() - interval '2 minutes'
    from public.connexion_referent c
    join public.referent r on r.id = c.referent_id
    left join public.loge l on l.id = r.loge_id
   where public.est_admin()
     and (referent is null or c.referent_id = referent)
   order by c.debut desc
   limit least(greatest(coalesce(limite, 500), 1), 2000)
$$;

comment on function public.les_connexions_des_referents(integer, uuid) is
  'Les connexions des référents, la plus récente d''abord, pour Admin › '
  'Connexions — toutes, ou celles d''un seul référent. Ne rend rien à qui '
  'n''est pas administrateur.';

revoke all on function public.les_connexions_des_referents(integer, uuid) from public, anon;
grant execute on function public.les_connexions_des_referents(integer, uuid) to authenticated;

create or replace function public.les_referents_du_journal()
returns table (
  referent_id uuid,
  nom         text,
  prenom      text,
  loge_nom    text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nom, r.prenom, l.nom
    from public.referent r
    left join public.loge l on l.id = r.loge_id
   where public.est_admin()
     and exists (select 1 from public.connexion_referent c where c.referent_id = r.id)
   order by r.nom nulls last, r.prenom nulls last
$$;

comment on function public.les_referents_du_journal() is
  'Les référents qui ont au moins une connexion au journal, par nom : le menu '
  'du filtre d''Admin › Connexions. Ne rend rien à qui n''est pas '
  'administrateur.';

revoke all on function public.les_referents_du_journal() from public, anon;
grant execute on function public.les_referents_du_journal() to authenticated;
