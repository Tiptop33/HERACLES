-- ---------------------------------------------------------------------------
-- 0077 — l'adresse du Secrétaire de ma loge, pour l'écran de mise en page
--
-- Ce que ça change : dans Paramètres › Mise en page › CV anonyme, le champ
-- « Adresse de contact » montre l'adresse électronique du Secrétaire de la
-- loge de la personne connectée — celle que les CV impriment tant que
-- personne ne la remplace (0076). Demande du 10 novembre 2026, sur
-- l'instance d'essai : l'adresse doit se voir dans le champ, pas seulement
-- dans une phrase d'aide.
--
-- `officier_de_la_loge()` (0067) n'est ouverte à personne : cette fonction en
-- rend une seule colonne, pour une seule loge, la mienne. Une personne de la
-- loge voit déjà cette adresse sur l'affichette et dans l'annuaire.
-- ---------------------------------------------------------------------------

create or replace function public.email_du_secretaire_de_ma_loge()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(s.email), '')
    from public.officier_de_la_loge(public.ma_loge(), array['secrétaire']) s
$$;

comment on function public.email_du_secretaire_de_ma_loge() is
  'L''adresse électronique du Secrétaire de ma loge (titre « Secrétaire » au '
  'collège), ou null. Valeur d''origine du contact du CV anonyme à l''écran.';

revoke all on function public.email_du_secretaire_de_ma_loge() from public, anon;
grant execute on function public.email_du_secretaire_de_ma_loge() to authenticated;
