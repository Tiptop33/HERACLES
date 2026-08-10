-- ---------------------------------------------------------------------------
-- 0057 — les postes à pourvoir
--
-- Ce que ça change : la commission peut noter les postes qu'on lui remonte —
-- un Frère dont l'entreprise recrute, une connaissance qui cherche quelqu'un —
-- et l'affiche les publie en regard des dossiers en recherche. C'est la
-- seconde moitié du document : d'un côté ceux qui cherchent, de l'autre ce
-- qu'il y a à prendre.
--
-- POURQUOI UNE TABLE, ET NON `offre_emploi`
--
-- `offre_emploi` vient de France Travail : elle n'appartient à aucune loge,
-- elle se déverse par milliers, et elle n'a ni contact ni adresse à qui
-- écrire. Ce n'est pas la même chose. Un poste à pourvoir ici est une
-- information *rapportée par quelqu'un*, avec le nom de la personne à joindre
-- — c'est justement ce que l'affiche imprime, et ce qui manquait.
--
-- Les deux cohabiteront : France Travail alimente la recherche d'offres du
-- lot 4 ; ceci alimente l'affiche.
--
-- FERMÉE, COMME `reunion`
--
-- RLS activée et **aucune policy**. Tout passe par les fonctions ci-dessous,
-- qui portent le contrôle : on ne lit que les postes de sa loge, on n'écrit
-- que dans sa loge. Une requête qui oublierait son `where` ne rendrait rien —
-- c'est la règle du projet, et c'est ce qui la rend vraie.
--
-- CE QU'UN POSTE PORTE DE PERSONNEL
--
-- `contact` et `email` désignent une personne à joindre dans l'entreprise. Ce
-- sont des données personnelles, et elles paraissent sur un document qui
-- circule : c'est le seul endroit de l'affiche où cela se produit. Elles sont
-- là parce que le document d'origine les porte, et parce qu'un poste sans
-- personne à qui écrire ne sert à rien. Elles restent dans la loge tant que
-- personne n'imprime.
--
-- RETIRER PLUTÔT QU'EFFACER
--
-- Un poste pourvu, ou remonté par erreur, se retire : `retire_le`. La ligne
-- reste, comme pour les réunions. On saura l'an prochain ce que la commission
-- a fait circuler, et un retrait malheureux se rattrape.
-- ---------------------------------------------------------------------------

create table if not exists public.poste_a_pourvoir (
  id          uuid primary key default gen_random_uuid(),

  loge_id     uuid not null references public.loge (id) on delete cascade,

  -- Ce que l'affiche imprime, dans l'ordre de ses colonnes.
  intitule    text not null,
  societe     text,
  ville       text,
  contact     text,
  email       text,

  propose_par uuid references public.referent (id) on delete set null,
  retire_le   timestamptz,
  retire_par  uuid references public.referent (id) on delete set null,

  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now()
);

comment on table public.poste_a_pourvoir is
  'Les postes remontés à la commission, publiés par l''affiche. Distincts des '
  'offres de France Travail (offre_emploi) : ceux-ci appartiennent à une loge '
  'et portent une personne à joindre.';

create index if not exists poste_a_pourvoir_loge_idx
  on public.poste_a_pourvoir (loge_id)
  where retire_le is null;

alter table public.poste_a_pourvoir enable row level security;

drop trigger if exists poste_a_pourvoir_maj_le on public.poste_a_pourvoir;
create trigger poste_a_pourvoir_maj_le
  before update on public.poste_a_pourvoir
  for each row execute function public.toucher_maj_le();

-- ---------------------------------------------------------------------------
-- Lire : les postes ouverts de ma loge
--
-- Deux fonctions pour une seule liste, parce qu'elles servent deux choses :
--
--   · `mes_postes_a_pourvoir()` — l'écran, qui montre le cadre même quand
--     aucune feuille d'appel n'est ouverte ;
--   · `postes_a_pourvoir(réunion)` — le document, qui n'imprime que si la
--     réunion demandée est bien de ma loge. La porte est la même que pour les
--     deux fonctions de 0055 : c'est ce qu'on imprime qui décide.
--
-- La seconde délègue à la première : une seule définition de « poste ouvert »,
-- qui ne pourra pas diverger.
-- ---------------------------------------------------------------------------
create or replace function public.mes_postes_a_pourvoir()
returns table (
  id       uuid,
  intitule text,
  societe  text,
  ville    text,
  contact  text,
  email    text,
  /** Le jour où il a été remonté — la liste range du plus récent. */
  remonte_le date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.intitule, p.societe, p.ville, p.contact, p.email, p.cree_le::date
    from public.poste_a_pourvoir p
   where p.loge_id = public.ma_loge()
     and p.retire_le is null
   order by p.cree_le desc
$$;

comment on function public.mes_postes_a_pourvoir() is
  'Les postes à pourvoir de ma loge, les retirés exceptés, du plus récent au '
  'plus ancien. Sans loge, aucune ligne.';

revoke all on function public.mes_postes_a_pourvoir() from public, anon;
grant execute on function public.mes_postes_a_pourvoir() to authenticated;

create or replace function public.postes_a_pourvoir(reunion_choisie uuid)
returns table (
  id       uuid,
  intitule text,
  societe  text,
  ville    text,
  contact  text,
  email    text,
  remonte_le date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.mes_postes_a_pourvoir() p
   where exists (
     select 1 from public.reunion r
      where r.id = reunion_choisie and r.loge_id = public.ma_loge()
   )
$$;

comment on function public.postes_a_pourvoir(uuid) is
  'Les postes à pourvoir pour l''affiche de cette réunion : la même liste que '
  'mes_postes_a_pourvoir(), et rien du tout si la réunion n''est pas de ma loge.';

revoke all on function public.postes_a_pourvoir(uuid) from public, anon;
grant execute on function public.postes_a_pourvoir(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Écrire : noter un poste, le retirer
-- ---------------------------------------------------------------------------
create or replace function public.noter_un_poste(le_poste text,
                                                 la_societe text default null,
                                                 la_ville text default null,
                                                 le_contact text default null,
                                                 l_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  la_loge uuid := public.ma_loge();
  neuf    uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Un poste sans intitulé n'est pas un poste : l'affiche imprimerait une
  -- ligne vide, et personne ne saurait ce qu'on lui propose.
  if nullif(btrim(le_poste), '') is null then
    raise exception 'Un poste à pourvoir a besoin d''un intitulé'
      using errcode = 'check_violation';
  end if;

  insert into public.poste_a_pourvoir
    (loge_id, intitule, societe, ville, contact, email, propose_par)
  values (la_loge, btrim(le_poste),
          nullif(btrim(coalesce(la_societe, '')), ''),
          nullif(btrim(coalesce(la_ville, '')), ''),
          nullif(btrim(coalesce(le_contact, '')), ''),
          nullif(btrim(coalesce(l_email, '')), ''),
          moi)
  returning id into neuf;

  return neuf;
end
$$;

comment on function public.noter_un_poste(text, text, text, text, text) is
  'Note un poste à pourvoir dans ma loge et rend son identifiant. L''intitulé '
  'est obligatoire ; le reste est facultatif, un poste se remonte souvent avant '
  'd''être complet.';

revoke all on function public.noter_un_poste(text, text, text, text, text) from public, anon;
grant execute on function public.noter_un_poste(text, text, text, text, text) to authenticated;

create or replace function public.retirer_un_poste(poste_choisi uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi uuid := public.referent_courant();
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Pourvu, ou remonté par erreur : la ligne reste, elle sort de l'affiche.
  update public.poste_a_pourvoir
     set retire_le = now(), retire_par = moi
   where id = poste_choisi
     and loge_id = public.ma_loge()
     and retire_le is null;

  return found;
end
$$;

comment on function public.retirer_un_poste(uuid) is
  'Retire un poste à pourvoir de ma loge : il sort de l''affiche, sa ligne '
  'reste. Rend faux si le poste n''est pas de ma loge, ou déjà retiré.';

revoke all on function public.retirer_un_poste(uuid) from public, anon;
grant execute on function public.retirer_un_poste(uuid) to authenticated;
