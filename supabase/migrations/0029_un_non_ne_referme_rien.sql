-- ---------------------------------------------------------------------------
-- 0029 — un « Non » ne referme pas un dossier
--
-- Ce que ça change : les compteurs de l'accueil et de l'annuaire retrouvent
-- leurs vrais chiffres. Ils affichaient zéro partout.
--
-- Deux définitions de « dossier refermé » cohabitaient, et elles ne disaient
-- pas la même chose :
--
--   * `apps/web/src/lib/suivi.ts` écarte les négations — « une valeur qui
--     commence par une négation ne referme rien ». C'est ce qui permet au
--     poste de travail d'annoncer treize dossiers en cours.
--
--   * `candidat_est_clos()` (migration 0011) prenait toute valeur non vide
--     pour une fermeture.
--
-- La colonne `ARCHIVER` de Bubble est un **oui/non**, et elle est remplie sur
-- les 107 fiches : 94 « Oui », 13 « Non », aucune vide (relevé du 7 août 2026,
-- voir `docs/MAJBUBBLE.md`). Pour la fonction SQL, les 107 dossiers étaient
-- donc clos — les treize en cours compris. D'où des compteurs à zéro sur
-- l'accueil, et des cartes d'annuaire annonçant « aucun candidat accompagné »
-- pour des référents qui en accompagnent.
--
-- Les deux définitions n'en font plus qu'une, et c'est celle qui se trompe du
-- bon côté. Un dossier ouvert affiché comme clos se perd ; un dossier clos
-- affiché comme ouvert fait perdre une seconde.
--
-- Aucun droit ne change : `candidat_est_clos()` ne décide de rien d'autre que
-- d'un décompte. Ce qu'on a le droit de lire est affaire de policies, et elles
-- ne sont pas touchées ici.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le mot qui referme, ou rien
--    Même règle, mêmes mots que `motDeFermeture()` dans `suivi.ts`. Les deux
--    doivent se lire ensemble : si l'un change, l'autre change.
--
--    `\y` et non `\b` : dans les expressions régulières de PostgreSQL, `\b`
--    est un retour arrière. C'est `\y` qui marque la frontière d'un mot.
-- ---------------------------------------------------------------------------
create or replace function public.mot_de_fermeture(valeur text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(valeur, '')), '') is null then null
    when trim(valeur) ~* '^(non|no|false|0|aucune|aucun)\y'  then null
    else trim(valeur)
  end
$$;

comment on function public.mot_de_fermeture(text) is
  'Le motif de fermeture porté par une colonne de Bubble, ou null. Une valeur '
  'qui commence par une négation ne referme rien : `ARCHIVER` est un oui/non, '
  'et ses treize « Non » sont les dossiers en cours.';

-- ---------------------------------------------------------------------------
-- 2. Ce qu'on appelle « clos »
--    Deux colonnes de texte libre, et il faut les deux : un dossier archivé
--    sans être clôturé est refermé lui aussi.
-- ---------------------------------------------------------------------------
create or replace function public.candidat_est_clos(c public.candidat)
returns boolean
language sql
immutable
as $$
  select coalesce(
    public.mot_de_fermeture(c.cloture),
    public.mot_de_fermeture(c.archive)
  ) is not null
$$;

comment on function public.candidat_est_clos(public.candidat) is
  'Vrai si le dossier est clôturé ou archivé — les deux colonnes de Bubble, '
  'négations écartées. Même règle que `estFerme()` côté application.';

-- ---------------------------------------------------------------------------
-- 3. Les droits d'exécution
--    `candidat_est_clos()` est appelable par `authenticated` depuis 0011 ; le
--    mot de fermeture qu'elle consulte doit l'être aussi.
-- ---------------------------------------------------------------------------
revoke all on function public.mot_de_fermeture(text) from public, anon;
grant execute on function public.mot_de_fermeture(text) to authenticated;
grant execute on function public.candidat_est_clos(public.candidat) to authenticated;
