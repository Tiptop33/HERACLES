-- ---------------------------------------------------------------------------
-- 0042 — qui est là
--
-- Ce que ça change : la colonne de gauche montre, sous votre nom, les
-- référents de votre loge connectés au même moment, avec leur photo.
--
-- CE QUE « CONNECTÉ » VEUT DIRE ICI
--
-- Non pas « actif il y a moins de N minutes », mais **la session est ouverte**.
-- `profil.connecte_depuis` est posé à la connexion et effacé à la déconnexion.
-- C'est le sens le plus simple à expliquer : je me suis connecté, je suis dans
-- la liste ; je me déconnecte, j'en sors.
--
-- Le défaut connu, et assumé : on ferme rarement une session, on ferme un
-- onglet. Sans garde-fou, la liste finirait par afficher tous ceux qui se sont
-- connectés un jour — et ne voudrait plus rien dire.
--
-- D'où `SESSION_MAXIMALE`, douze heures : au-delà, la session est réputée
-- close même sans déconnexion. Douze heures couvrent largement une journée de
-- travail, y compris une réunion du soir commencée l'après-midi, et évitent
-- qu'un onglet oublié le lundi soit encore « là » le vendredi. La valeur est
-- dans un seul endroit, ci-dessous, pour se changer d'une ligne.
--
-- CE QUE CETTE LISTE N'EST PAS
--
-- Un registre de fréquentation. `connecte_depuis` n'est pas historisé : la
-- colonne ne garde que la connexion en cours, et elle est effacée ensuite.
-- Personne ne peut reconstituer les horaires de qui que ce soit.
--
-- ELLE NE SORT PAS DE LA LOGE
--
-- `les_connectes()` ne rend que les référents de ma loge. Savoir qui travaille
-- en ce moment dans une autre loge ne regarde personne.
-- ---------------------------------------------------------------------------

alter table public.profil
  add column if not exists connecte_depuis timestamptz;

comment on column public.profil.connecte_depuis is
  'Début de la session en cours, ou nul. Sert à afficher « qui est là » ; '
  'effacée à la déconnexion, donc sans historique et sans usage de '
  'surveillance.';

-- ---------------------------------------------------------------------------
-- Ouvrir et fermer sa session
-- ---------------------------------------------------------------------------
create or replace function public.je_me_connecte()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  -- `coalesce` : se reconnecter dans un second onglet ne remet pas le
  -- compteur à zéro, sans quoi le garde-fou des douze heures ne s'appliquerait
  -- jamais à qui rafraîchit sa session.
  update public.profil
     set connecte_depuis = coalesce(connecte_depuis, now())
   where id = auth.uid()
$$;

comment on function public.je_me_connecte() is
  'Marque la session comme ouverte. Rejouable : une seconde connexion ne '
  'décale pas l''heure de début.';

create or replace function public.je_me_deconnecte()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profil set connecte_depuis = null where id = auth.uid()
$$;

comment on function public.je_me_deconnecte() is
  'Marque la session comme close. Appelée avant `signOut()`, tant que la '
  'session vaut encore.';

revoke all on function public.je_me_connecte() from public, anon;
revoke all on function public.je_me_deconnecte() from public, anon;
grant execute on function public.je_me_connecte() to authenticated;
grant execute on function public.je_me_deconnecte() to authenticated;

-- ---------------------------------------------------------------------------
-- Qui est là
--
-- Les référents de ma loge dont la session est ouverte, **moi excepté** : mon
-- nom est déjà au-dessus, dans la colonne.
-- ---------------------------------------------------------------------------
create or replace function public.les_connectes()
returns table (
  referent_id uuid,
  nom         text,
  prenom      text,
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- `photo_chemin`, et non `photo_url` : celle de Bubble n'est pas servie par
  -- l'application, comme dans l'annuaire (0015).
  select r.id, r.nom, r.prenom, r.photo_chemin is not null
    from public.referent r
    join public.profil p on p.id = r.profil_id
   where r.loge_id = public.ma_loge()
     and r.id is distinct from public.referent_courant()
     and p.connecte_depuis is not null
     -- Le garde-fou : un onglet oublié n'est pas une présence.
     and p.connecte_depuis > now() - interval '12 hours'
   order by p.connecte_depuis desc, r.nom, r.prenom
$$;

comment on function public.les_connectes() is
  'Les référents de ma loge dont la session est ouverte, moi excepté. Une '
  'session de plus de douze heures est réputée close : on ferme un onglet, '
  'on ne se déconnecte pas.';

revoke all on function public.les_connectes() from public, anon;
grant execute on function public.les_connectes() to authenticated;
