-- ---------------------------------------------------------------------------
-- 0043 — l'exercice court jusqu'au 31 août 2026
--
-- Ce que ça change : l'exercice enregistré, repris de Bubble, se terminait le
-- **31 juillet 2026**. Il était donc clos, et tout ce qui s'est tenu depuis
-- tombait hors bornes : les réunions n'entraient ni au registre de l'exercice
-- ni dans l'assiduité, et la feuille d'appel affichait « aucune présence cette
-- année » sous chaque nom quoi qu'on y pointe.
--
-- La fin passe au **31 août 2026**. Le début ne bouge pas : 1er septembre 2025.
--
-- POURQUOI CETTE MIGRATION NE REJOUE PAS SES VALEURS
--
-- Les dates d'exercice sont une donnée d'exploitation, pas un schéma. Or le
-- serveur rejoue TOUTES les migrations à CHAQUE déploiement : écrire les dates
-- sans condition les remettrait à celles-ci à chaque mise en ligne, et le jour
-- où quelqu'un les avancera d'un an, le déploiement suivant défera son travail
-- sans rien dire.
--
-- D'où la garde : on ne corrige que si la fin est encore celle de Bubble, ou
-- absente. Dès qu'une autre valeur y figure — la prochaine, ou la même posée à
-- la main —, la migration se tait et le dit dans le journal du déploiement.
-- ---------------------------------------------------------------------------

do $$
declare
  avant_depart timestamptz;
  avant_fin    timestamptz;
begin
  select p.date_depart, p.date_fin into avant_depart, avant_fin
    from public.parametre p where p.id;

  -- On ne crée pas la ligne de réglages : ce n'est pas le travail d'une
  -- migration qui corrige une date. Sur une base neuve il n'y a rien à
  -- corriger, et la reprise Bubble la posera.
  if not found then
    raise notice 'Aucune ligne de réglages : rien à corriger.';
    return;
  end if;

  -- La fin reprise de Bubble, ou rien du tout : c'est ce qu'on corrige.
  if avant_fin is null or avant_fin::date = date '2026-07-31' then
    update public.parametre
       set date_depart = '2025-09-01',
           date_fin    = '2026-08-31'
     where id;
    raise notice 'Exercice porté au 31 août 2026 (il finissait le %).',
      coalesce(avant_fin::date::text, 'néant');
  else
    raise notice 'Exercice laissé tel quel : % → %. La migration 0043 ne '
                 'corrige que la fin reprise de Bubble (31 juillet 2026).',
      coalesce(avant_depart::date::text, 'néant'),
      avant_fin::date;
  end if;
end
$$;
