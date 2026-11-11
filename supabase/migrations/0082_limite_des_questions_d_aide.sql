-- ---------------------------------------------------------------------------
-- 0082 — la limite des questions posées à Claude par l'aide, tenue en base
--
-- Ce que ça change : quand la recherche de l'aide ne trouve rien, un référent
-- ou un administrateur peut demander à Claude. Dix questions par personne et
-- par quart d'heure, pas plus — chaque question coûte, et le plafond mensuel
-- est partagé avec la lecture des CV.
--
-- Pourquoi : ce compteur vivait en mémoire du serveur web. Il repartait de
-- zéro à chaque redémarrage — donc à chaque déploiement — et ne valait que
-- pour un seul processus. Il vit maintenant ici.
--
-- Ce que la table garde : qui a demandé, et quand. **Pas la question** : son
-- texte peut porter un nom, et rien n'oblige à le conserver pour compter. Les
-- lignes de plus d'un jour sont effacées au passage suivant.
--
-- Fermée par défaut : RLS activée, aucune policy. Personne ne lit ni n'écrit
-- cette table ; seule la fonction ci-dessous y touche, et elle ne rend qu'un
-- oui ou un non.
-- ---------------------------------------------------------------------------

create table if not exists public.aide_question (
  id         bigint generated always as identity primary key,
  profil_id  uuid not null references public.profil (id) on delete cascade,
  posee_le   timestamptz not null default now()
);

comment on table public.aide_question is
  'Les demandes faites à Claude par l''aide : qui, quand — jamais le texte. '
  'Sert à compter dix questions par quart d''heure et par personne (0082).';

create index if not exists aide_question_profil_posee_le
  on public.aide_question (profil_id, posee_le);

alter table public.aide_question enable row level security;

revoke all on public.aide_question from public, anon, authenticated;

-- Compte la demande de la personne connectée, et dit si elle passe.
--
-- Sans paramètre, à dessein : ni la limite ni la fenêtre ne se choisissent
-- depuis l'extérieur, et l'on ne compte que pour soi (`auth.uid()`).
--
-- `security definer` : la table est fermée à tous ; la fonction est sa seule
-- porte. Le verrou consultatif range les appels simultanés d'une même
-- personne — deux onglets ne passent pas la onzième question à deux.
create or replace function public.compter_une_question_d_aide()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moi uuid := auth.uid();
  recentes integer;
begin
  if moi is null then
    return false;
  end if;

  -- L'aide ne propose Claude qu'en espace de travail : un compte de candidat
  -- n'a rien à compter ici, même en appelant la fonction à la main.
  if not exists (
    select 1 from public.profil p
     where p.id = moi and p.role in ('referent', 'admin')
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aide_question:' || moi::text, 0));

  -- Le ménage : rien de plus vieux qu'un jour ne sert à compter un quart
  -- d'heure, et ces lignes disent qui s'est servi de l'aide.
  delete from public.aide_question where posee_le < now() - interval '1 day';

  select count(*) into recentes
    from public.aide_question q
   where q.profil_id = moi
     and q.posee_le > now() - interval '15 minutes';

  if recentes >= 10 then
    return false;
  end if;

  insert into public.aide_question (profil_id) values (moi);
  return true;
end
$$;

comment on function public.compter_une_question_d_aide() is
  'Enregistre une demande d''aide à Claude pour la personne connectée et rend '
  'vrai si elle passe : dix par quart d''heure. Faux au-delà, sans rien écrire.';

revoke all on function public.compter_une_question_d_aide() from public, anon;
grant execute on function public.compter_une_question_d_aide() to authenticated;
