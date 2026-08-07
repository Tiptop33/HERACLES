-- ---------------------------------------------------------------------------
-- 0021 — le suivi : ce qui s'est passé, daté
--
-- Ce que ça change : l'onglet « Suivi & tâches » du poste de travail (maquette
-- 1c) était éteint, faute de savoir ce qu'il devait contenir. Réponse donnée
-- le 7 août 2026 : un journal. On y écrit après coup — « appel du 12 mars »,
-- « entretien passé », « CV envoyé chez Untel ». Rien à cocher, rien à faire :
-- ce qui a eu lieu, et quand.
--
-- POURQUOI UNE TABLE ET NON UN CHAMP DE PLUS SUR LA FICHE
--
-- `candidat.appreciation` existe déjà, et c'est un texte qu'on écrase. Un
-- journal ne s'écrase pas : chaque ligne porte sa date, son auteur, et reste.
-- C'est ce qui permet de reprendre un dossier six mois plus tard, ou de le
-- passer à quelqu'un d'autre.
--
-- CE QUE BUBBLE N'A PAS DONNÉ
--
-- `candidat.taches_bubble_ids` porte des identifiants vers le type `TACHES`,
-- que l'API de Bubble n'expose pas (vérifié le 7 août : sept types seulement).
-- Cette table démarre donc vide. Si `TACHES` est exposé avant la bascule, son
-- contenu viendra s'y déverser — d'où `bubble_id`, qui attend.
-- Voir `docs/MAJBUBBLE.md`.
--
-- QUI LIT, QUI ÉCRIT
--
--   · lire   — la loge, comme la fiche (0020). Un journal qu'on ne peut pas
--              lire ne sert pas à passer un dossier à un collègue.
--   · écrire — le référent et le parrain, comme la fiche (0006). Administrer
--              n'est pas accompagner.
--   · corriger — son propre écrit, et rien d'autre.
--   · supprimer — aucune policy. Un journal dont on efface les lignes n'est
--                 plus un journal ; une faute se corrige.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------
create table if not exists public.suivi (
  id           uuid primary key default gen_random_uuid(),
  bubble_id    text unique,

  candidat_id  uuid not null references public.candidat (id) on delete cascade,
  -- Qui l'a écrit. La fiche de référent, et non le compte : elle survit au
  -- compte, et c'est elle que l'annuaire nomme.
  auteur_id    uuid references public.referent (id) on delete set null,

  -- Le jour où c'est arrivé, qui n'est pas toujours celui où on l'écrit : on
  -- note le lundi l'appel du vendredi.
  fait_le      date not null default current_date,
  -- « Appel », « Entretien », « CV envoyé »… Du texte libre pour l'instant.
  -- À faire passer en référentiel, comme le collège, quand les valeurs
  -- employées seront connues — c'est-à-dire après quelques semaines d'usage.
  nature       text,
  texte        text not null,

  cree_le      timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

comment on table public.suivi is
  'Le journal d''un candidat : ce qui s''est passé, daté. Une ligne par '
  'événement, jamais écrasée — c''est ce qui permet de reprendre un dossier '
  'six mois plus tard.';

comment on column public.suivi.fait_le is
  'Le jour de l''événement, pas celui de la saisie : on note le lundi l''appel du vendredi.';

-- La lecture se fait toujours par candidat, du plus récent au plus ancien.
create index if not exists suivi_candidat_idx
  on public.suivi (candidat_id, fait_le desc, cree_le desc);

-- ---------------------------------------------------------------------------
-- 2. Fermée par défaut, comme le reste
-- ---------------------------------------------------------------------------
alter table public.suivi enable row level security;

-- Écrire : le référent et le parrain du candidat, personne d'autre. Et
-- l'auteur déclaré doit être soi : sans cette seconde condition, on pourrait
-- signer du nom d'un collègue.
drop policy if exists suivi_ecriture_accompagnes on public.suivi;
create policy suivi_ecriture_accompagnes on public.suivi
  for insert
  to authenticated
  with check (
    auteur_id = (select public.referent_courant())
    and candidat_id in (
      select c.id from public.candidat c
       where c.referent_id = (select public.referent_courant())
          or c.parrain_id  = (select public.referent_courant())
    )
  );

-- Corriger : son propre écrit, et il reste sien.
drop policy if exists suivi_correction_auteur on public.suivi;
create policy suivi_correction_auteur on public.suivi
  for update
  to authenticated
  using (auteur_id = (select public.referent_courant()))
  with check (auteur_id = (select public.referent_courant()));

-- Lire en direct : ses propres lignes, et elles seules.
--
-- Ce n'est pas la lecture de l'écran — celle-là passe par la fonction plus
-- bas, qui s'élargit à la loge. C'est ce que `corriger` exige : PostgreSQL
-- applique aussi les policies de SELECT au `where` d'un `update`, et sans
-- celle-ci un référent ne retrouverait pas la ligne qu'il vient d'écrire.
-- Elle n'ouvre rien de plus que ce qu'on a soi-même écrit.
drop policy if exists suivi_lecture_sienne on public.suivi;
create policy suivi_lecture_sienne on public.suivi
  for select
  to authenticated
  using (auteur_id = (select public.referent_courant()));

-- Pas de suppression : voir l'en-tête.

-- ---------------------------------------------------------------------------
-- 3. Lire le journal d'un candidat
--    Même dessin que la liste (0019) et la fiche (0020) : une fonction rend
--    exactement ce que l'écran affiche, et la table reste fermée.
-- ---------------------------------------------------------------------------
drop function if exists public.suivi_du_candidat(uuid);

create function public.suivi_du_candidat(candidat uuid)
returns table (
  id          uuid,
  fait_le     date,
  nature      text,
  texte       text,
  auteur_nom  text,
  /** Le mien : l'écran ne propose de corriger que ce qu'on a écrit. */
  c_est_moi   boolean,
  cree_le     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.nature, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
   where s.candidat_id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_du_candidat(uuid) is
  'Le journal d''un candidat, du plus récent au plus ancien, pour qui a le '
  'droit de voir sa fiche (même règle que 0020). Écrire passe par la table, '
  'donc par la RLS : le référent et le parrain seulement.';

revoke all on function public.suivi_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_du_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les droits de table
--    Nommés, jamais en bloc : c'est la discipline posée en 0007.
-- ---------------------------------------------------------------------------
revoke all on public.suivi from public, anon;
grant select, insert, update on public.suivi to authenticated;
grant all on public.suivi to service_role;

-- La date de dernière retouche se tient toute seule.
drop trigger if exists suivi_maj_le on public.suivi;
create trigger suivi_maj_le
  before update on public.suivi
  for each row execute function public.toucher_maj_le();
