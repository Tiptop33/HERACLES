-- ---------------------------------------------------------------------------
-- 0017 — les titres du collège
--
-- Ce que ça change : « Vénérable Maître », « Secrétaire », « Trésorier » ne se
-- retapent plus à la main sur chaque fiche. Ils vivent dans une liste que
-- l'administration tient, et le champ « Collège » d'un référent devient un
-- choix dans cette liste.
--
-- Pourquoi une table et non une liste écrite dans le code : ces titres ne sont
-- pas une affaire de programme. Ils changent, ils s'ajoutent, et le jour où il
-- en manque un il ne faut pas attendre une mise en ligne.
--
-- `referent.college` reste du texte, et n'est PAS transformé en clé étrangère.
-- Deux raisons : la reprise Bubble a laissé des valeurs que personne n'a
-- validées, et un lien dur les aurait fait disparaître ou aurait bloqué la
-- reprise. Le champ garde ce qu'il porte ; la liste ne fait que proposer.
--
-- Conséquence assumée : retirer un titre de la liste ne touche à aucune fiche.
-- Celles qui le portaient le gardent, et l'écran de correction le montrera
-- toujours. C'est le contraire d'une suppression en cascade, et c'est voulu.
-- ---------------------------------------------------------------------------

create table if not exists public.college (
  id       uuid primary key default gen_random_uuid(),
  nom      text not null,
  -- L'ordre d'affichage. Le Vénérable Maître avant le Trésorier n'est pas
  -- alphabétique : c'est un ordre que seule la loge connaît.
  rang     integer not null default 100,
  cree_le  timestamptz not null default now()
);

comment on table public.college is
  'Les titres qu''un référent peut porter. Liste tenue par l''administration, '
  'proposée par le champ « Collège » — jamais imposée : referent.college reste '
  'du texte libre.';

-- Deux fois le même titre à une majuscule près, et la liste devient illisible.
create unique index if not exists college_nom_unique
  on public.college (lower(btrim(nom)));

alter table public.college enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Qui lit, qui écrit
--    Lecture ouverte à toute session : c'est un référentiel, il ne dit rien de
--    personne. Le formulaire d'un référent en a besoin pour remplir sa liste.
--    Écriture aux seuls administrateurs.
-- ---------------------------------------------------------------------------
drop policy if exists college_lecture on public.college;
create policy college_lecture on public.college
  for select to authenticated
  using (true);

drop policy if exists college_ecriture_admin on public.college;
create policy college_ecriture_admin on public.college
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

grant select, insert, update, delete on public.college to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La liste, avec ce qu'il faut pour la tenir
--    Combien de référents portent chaque titre : sans ce nombre, on retire un
--    titre sans savoir qu'il est en service. Le compte suppose de lire des
--    fiches que l'appelant n'a pas le droit de lire — d'où la fonction.
-- ---------------------------------------------------------------------------
create or replace function public.liste_college()
returns table (id uuid, nom text, rang integer, utilisations integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nom, c.rang,
         (select count(*)::integer
            from public.referent r
           where lower(btrim(r.college)) = lower(btrim(c.nom)))
    from public.college c
   order by c.rang, c.nom
$$;

comment on function public.liste_college() is
  'Les titres du collège, dans l''ordre voulu, avec le nombre de référents qui '
  'les portent. Le compte est le seul renseignement qui sorte des fiches.';

revoke all on function public.liste_college() from public, anon;
grant execute on function public.liste_college() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ranger la liste
--    L'ordre n'est pas alphabétique : le Vénérable Maître vient avant le
--    Trésorier parce que la loge en a décidé ainsi, et cet ordre-là ne se
--    devine pas. On l'échange donc voisin par voisin.
--
--    La renumérotation d'abord : après quelques ajouts, plusieurs titres
--    partagent le rang 100 et « celui d'au-dessus » ne veut plus rien dire.
--    On remet 10, 20, 30… dans l'ordre courant, puis on échange.
-- ---------------------------------------------------------------------------
create or replace function public.deplacer_college(cible uuid, vers text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rang_cible  integer;
  voisin      uuid;
  rang_voisin integer;
begin
  if not public.est_admin() then
    raise exception 'Seul un administrateur peut ranger cette liste'
      using errcode = 'insufficient_privilege';
  end if;

  if vers not in ('haut', 'bas') then
    raise exception 'Sens inconnu' using errcode = 'invalid_parameter_value';
  end if;

  with ordonne as (
    select c.id, row_number() over (order by c.rang, c.nom) as place
      from public.college c
  )
  update public.college c
     set rang = o.place * 10
    from ordonne o
   where o.id = c.id;

  select c.rang into rang_cible from public.college c where c.id = cible;
  if not found then
    raise exception 'Ce titre n''existe plus' using errcode = 'no_data_found';
  end if;

  if vers = 'haut' then
    select c.id, c.rang into voisin, rang_voisin
      from public.college c where c.rang < rang_cible order by c.rang desc limit 1;
  else
    select c.id, c.rang into voisin, rang_voisin
      from public.college c where c.rang > rang_cible order by c.rang asc limit 1;
  end if;

  -- Déjà en haut, ou déjà en bas : il n'y a rien à faire, et ce n'est pas une
  -- erreur. L'écran n'affiche d'ailleurs pas la flèche dans ce cas.
  if voisin is null then
    return;
  end if;

  update public.college set rang = rang_voisin where id = cible;
  update public.college set rang = rang_cible   where id = voisin;
end;
$$;

comment on function public.deplacer_college(uuid, text) is
  'Échange un titre avec son voisin du dessus ou du dessous. Renumérote la '
  'liste au passage, sans quoi « le suivant » perd son sens après quelques '
  'ajouts.';

revoke all on function public.deplacer_college(uuid, text) from public, anon;
grant execute on function public.deplacer_college(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La liste de départ
--    Les trois titres nommés, puis ceux que la reprise Bubble a laissés dans
--    les fiches. On ne part pas d'une page blanche : ce qui est déjà écrit sur
--    les fiches fait partie de la liste, sans quoi la première ouverture du
--    menu déroulant proposerait moins que ce qui existe.
-- ---------------------------------------------------------------------------
insert into public.college (nom, rang) values
  ('Vénérable Maître', 10),
  ('Secrétaire', 20),
  ('Trésorier', 30)
on conflict do nothing;

insert into public.college (nom, rang)
select distinct btrim(r.college), 100
  from public.referent r
 where r.college is not null
   and btrim(r.college) <> ''
on conflict do nothing;
