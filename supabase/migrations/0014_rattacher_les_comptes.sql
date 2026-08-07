-- ---------------------------------------------------------------------------
-- 0014 — rattacher les comptes déjà créés à leur fiche de référent
--
-- Ce que ça change : quelqu'un qui s'était connecté avant que ses données
-- arrivent de Bubble retrouve sa fiche, sa loge et ses candidats. Jusqu'ici,
-- il restait un compte sans fiche — c'est-à-dire, dans HERACLES, quelqu'un qui
-- ne voit ni collègues, ni candidats.
--
-- Le rattachement existe depuis 0006 : il se fait à l'inscription, et à
-- l'acceptation d'une invitation (0009). Ce qui manquait, c'est le rattrapage
-- — le cas où le compte précède la fiche, et non l'inverse.
--
-- Ce n'est pas un cas de bord : c'est exactement ce qui attend le jour de
-- MAJBUBBLE. Les 71 fiches arriveront de Bubble alors que des comptes auront
-- déjà été créés. D'où une fonction, et non une réparation écrite une fois :
-- elle se rejoue après chaque reprise.
--
-- Ce qu'elle ne fait pas : deviner. Elle ne rapproche que des adresses
-- identiques, ne touche qu'une fiche libre, et ne déplace jamais un
-- rattachement existant.
-- ---------------------------------------------------------------------------

create or replace function public.rattacher_les_comptes_orphelins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  compte record;
  faits  integer := 0;
begin
  for compte in
    select u.id, u.email
      from auth.users u
     where u.email is not null
       and not exists (select 1 from public.referent r where r.profil_id = u.id)
     order by u.id
  loop
    -- 0006 fait le travail, et pose les garde-fous : une seule fiche par
    -- compte, la plus ancienne quand deux portent la même adresse, et rien
    -- du tout si aucune ne correspond.
    if public.rattacher_referent_au_compte(compte.id, compte.email) is not null then
      faits := faits + 1;
    end if;
  end loop;

  return faits;
end;
$$;

comment on function public.rattacher_les_comptes_orphelins() is
  'Rapproche les comptes existants des fiches de référent portant la même '
  'adresse. À rejouer après chaque reprise Bubble — voir docs/MAJBUBBLE.md.';

-- Personne ne l'appelle depuis l'application : c'est un geste d'exploitation,
-- lancé à la main après une reprise. Elle reste ouverte à son propriétaire,
-- c'est-à-dire à qui joue les migrations.
revoke all on function public.rattacher_les_comptes_orphelins()
  from public, anon, authenticated;

-- Et on la joue tout de suite, pour les comptes d'aujourd'hui.
do $$
declare faits integer;
begin
  select public.rattacher_les_comptes_orphelins() into faits;
  raise notice '0014 — % compte(s) rattaché(s) à leur fiche de référent', faits;
end
$$;
