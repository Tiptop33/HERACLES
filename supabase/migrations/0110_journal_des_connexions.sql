-- ---------------------------------------------------------------------------
-- 0110 — le journal des connexions des référents
--
-- Ce que ça change : chaque connexion d'un référent est enregistrée — sa date,
-- son heure, sa durée — et l'administration les lit dans un tableau
-- (Admin › Connexions). Demandé le 26 novembre 2026.
--
-- CE QUE CETTE MIGRATION DÉFAIT, ET IL FAUT LE DIRE
--
-- 0042 et 0058 l'écrivaient en toutes lettres : « qui est là » n'est **pas** un
-- registre de fréquentation, rien n'est historisé, personne ne peut
-- reconstituer les horaires de qui que ce soit. Cette promesse ne vaut plus :
-- le journal ci-dessous est exactement ce registre. Les commentaires des
-- colonnes `profil.connecte_depuis` et `profil.vu_le` sont corrigés plus bas
-- pour ne plus affirmer ce qui est devenu faux. Le registre des traitements
-- (§ 3) le dit aussi, et les référents doivent en être informés.
--
-- CE QU'EST « UNE CONNEXION »
--
-- Non pas une ouverture de session au sens technique — on reste connecté des
-- jours sans retaper son mot de passe — mais **une présence continue devant
-- l'écran**. Elle commence à la connexion ou au premier signe de vie, et se
-- prolonge à chaque signe de vie (le passage de la colonne, toutes les trente
-- secondes tant que l'onglet est visible — 0058).
--
-- Elle se termine de deux façons :
--   · « Se déconnecter » : l'heure est notée dans `deconnecte_le` ;
--   · le silence : après trente minutes sans signe de vie, la connexion est
--     réputée close à son dernier signe, et le retour en ouvre une neuve.
--
-- Trente minutes : assez pour un coup de téléphone ou un autre onglet sans
-- couper la ligne en deux, assez peu pour qu'un départ le matin et un retour
-- l'après-midi fassent deux connexions, et non une de huit heures.
--
-- LA DURÉE
--
-- `coalesce(deconnecte_le, dernier_signe) - debut`. Précise à trente secondes
-- près — la cadence du signe de vie. Qui ferme son onglet sans se déconnecter
-- voit sa connexion s'arrêter à son dernier passage, pas trente minutes après.
--
-- QUI EST JOURNALISÉ
--
-- Les personnes qui ont une fiche `referent` reliée à leur compte. Un candidat
-- qui ouvre sa page passe par les mêmes fonctions : rien n'est noté pour lui.
--
-- QUI LIT
--
-- Les administrateurs, et eux seuls : policy de lecture sur `est_admin()`.
-- Aucune policy d'écriture — seules les fonctions ci-dessous écrivent, et
-- seulement sur la ligne de qui les appelle. Un référent ne lit ni ses
-- connexions ni celles des autres.
--
-- DOUZE MOIS
--
-- Les lignes de plus de douze mois sont supprimées à l'ouverture d'une
-- connexion nouvelle : pas de tâche planifiée de plus. Supprimer une fiche
-- référent emporte ses connexions (`on delete cascade`).
--
-- Rejouable : `if not exists`, `drop policy if exists`, `create or replace`.
-- ---------------------------------------------------------------------------

create table if not exists public.connexion_referent (
  id            uuid primary key default gen_random_uuid(),
  referent_id   uuid not null references public.referent (id) on delete cascade,
  debut         timestamptz not null default now(),
  dernier_signe timestamptz not null default now(),
  deconnecte_le timestamptz,
  constraint connexion_referent_ordre check (dernier_signe >= debut)
);

comment on table public.connexion_referent is
  'Journal des connexions des référents : une ligne par présence continue '
  'devant l''écran. Lu par les administrateurs seulement ; purgé au-delà de '
  'douze mois.';
comment on column public.connexion_referent.debut is
  'Date et heure du début de la connexion.';
comment on column public.connexion_referent.dernier_signe is
  'Dernier signe de vie de cette connexion. Sert de fin tant que '
  '`deconnecte_le` est vide.';
comment on column public.connexion_referent.deconnecte_le is
  'Heure du clic sur « Se déconnecter », ou nul : on ferme un onglet, on ne '
  'se déconnecte pas.';

create index if not exists connexion_referent_par_referent
  on public.connexion_referent (referent_id, debut desc);
create index if not exists connexion_referent_par_debut
  on public.connexion_referent (debut desc);

alter table public.connexion_referent enable row level security;

revoke all on public.connexion_referent from public, anon, authenticated;
grant select on public.connexion_referent to authenticated;

drop policy if exists connexion_referent_lecture_admin on public.connexion_referent;
create policy connexion_referent_lecture_admin on public.connexion_referent
  for select
  to authenticated
  using ((select public.est_admin()));

-- Les commentaires de 0042 et 0058 promettaient l'absence d'historique.
comment on column public.profil.connecte_depuis is
  'Début de la session en cours, ou nul. Sert à afficher « qui est là » ; '
  'effacée à la déconnexion. L''historique, lui, est tenu depuis 0110 dans '
  '`connexion_referent`.';
comment on column public.profil.vu_le is
  'Dernier signe de vie de la session en cours, ou nul. Écrasée à chaque '
  'passage, effacée à la déconnexion. L''historique, lui, est tenu depuis '
  '0110 dans `connexion_referent`.';

-- ---------------------------------------------------------------------------
-- Noter un signe de vie au journal
--
-- Appelée par les trois fonctions de présence, jamais directement : personne
-- n'en reçoit le droit d'exécution, et elle n'écrit que pour `auth.uid()`.
--
-- Les appelantes ont déjà mis à jour la ligne `profil` de la personne : ce
-- verrou range deux onglets qui passent au même instant, et l'on n'ouvre pas
-- deux connexions pour une.
-- ---------------------------------------------------------------------------
create or replace function public.noter_ma_connexion(deconnexion boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moi      uuid;
  derniere public.connexion_referent%rowtype;
  vivante  boolean;
begin
  select r.id into moi
    from public.referent r
   where r.profil_id = auth.uid()
   order by r.cree_le
   limit 1;
  -- Pas de fiche référent : un candidat, ou un compte relié à rien.
  if moi is null then
    return;
  end if;

  select * into derniere
    from public.connexion_referent c
   where c.referent_id = moi
   order by c.debut desc
   limit 1
     for update;

  vivante := found
    and derniere.deconnecte_le is null
    and derniere.dernier_signe > now() - interval '30 minutes';

  if deconnexion then
    -- Une connexion déjà close par le silence garde sa fin : la déconnexion
    -- d'un onglet oublié depuis la veille ne l'allonge pas.
    if vivante then
      update public.connexion_referent
         set dernier_signe = now(), deconnecte_le = now()
       where id = derniere.id;
    end if;
    return;
  end if;

  if vivante then
    update public.connexion_referent set dernier_signe = now() where id = derniere.id;
  else
    insert into public.connexion_referent (referent_id) values (moi);
    -- La purge des douze mois, au passage.
    delete from public.connexion_referent where debut < now() - interval '12 months';
  end if;
end
$$;

comment on function public.noter_ma_connexion(boolean) is
  'Tient le journal des connexions pour la personne connectée : prolonge la '
  'connexion en cours, en ouvre une neuve après trente minutes de silence, ou '
  'la clôt à la déconnexion. Sans effet pour qui n''a pas de fiche référent. '
  'Appelée par les fonctions de présence seulement.';

revoke all on function public.noter_ma_connexion(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les trois fonctions de présence, inchangées dans ce qu'elles faisaient
-- (0051, 0058), et qui tiennent désormais le journal au passage.
-- ---------------------------------------------------------------------------
create or replace function public.je_me_connecte()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.profil
     set connecte_depuis = case
           when connecte_depuis > now() - interval '12 hours' then connecte_depuis
           else now()
         end
   where id = auth.uid();
  perform public.noter_ma_connexion(false);
end
$$;

comment on function public.je_me_connecte() is
  'Marque la session comme ouverte (0051) et note la connexion au journal '
  '(0110). Rejouable : tant que la session est vivante, une seconde connexion '
  'ne décale pas l''heure de début.';

create or replace function public.je_suis_la()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.profil
     set vu_le = now()
   where id = auth.uid()
     and connecte_depuis is not null;
  -- Sans effet sur une session close (0058) — et donc rien au journal non
  -- plus : un onglet resté ouvert après « Se déconnecter » ne rouvre rien.
  if found then
    perform public.noter_ma_connexion(false);
  end if;
end
$$;

comment on function public.je_suis_la() is
  'Note un signe de vie sur ma session (0058) et prolonge ma connexion au '
  'journal (0110). Sans effet sur une session close.';

create or replace function public.je_me_deconnecte()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.profil
     set connecte_depuis = null,
         vu_le = null
   where id = auth.uid();
  perform public.noter_ma_connexion(true);
end
$$;

comment on function public.je_me_deconnecte() is
  'Marque la session comme close, efface le dernier signe de vie (0058) et '
  'clôt la connexion au journal (0110). Appelée avant `signOut()`.';

revoke all on function public.je_me_connecte() from public, anon;
revoke all on function public.je_suis_la() from public, anon;
revoke all on function public.je_me_deconnecte() from public, anon;
grant execute on function public.je_me_connecte() to authenticated;
grant execute on function public.je_suis_la() to authenticated;
grant execute on function public.je_me_deconnecte() to authenticated;

-- ---------------------------------------------------------------------------
-- Le tableau de l'administration
--
-- Une fonction plutôt qu'une vue : il lui faut le nom du référent et celui de
-- sa loge, toutes loges confondues. Elle vérifie `est_admin()` elle-même —
-- sans quoi elle ne rend rien.
-- ---------------------------------------------------------------------------
create or replace function public.les_connexions_des_referents(limite integer default 500)
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
   order by c.debut desc
   limit least(greatest(coalesce(limite, 500), 1), 2000)
$$;

comment on function public.les_connexions_des_referents(integer) is
  'Les connexions des référents, la plus récente d''abord, pour Admin › '
  'Connexions. Ne rend rien à qui n''est pas administrateur.';

revoke all on function public.les_connexions_des_referents(integer) from public, anon;
grant execute on function public.les_connexions_des_referents(integer) to authenticated;
