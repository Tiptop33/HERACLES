-- 0003_referent_email.sql
-- L'email d'un référent est enfoui dans l'objet `authentication` de Bubble, et
-- non dans un champ propre : le relevé initial l'avait donc manqué. Sans lui,
-- impossible de rapprocher une fiche reprise du compte HERACLES que la personne
-- créera plus tard.

alter table public.referent
  add column if not exists email text;

comment on column public.referent.email is
  'Repris de authentication.email.email côté Bubble. Sert à rattacher la fiche au compte le jour de l''inscription.';

create index if not exists referent_email_idx on public.referent (lower(email));
