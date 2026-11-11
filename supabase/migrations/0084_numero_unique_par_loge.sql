-- ---------------------------------------------------------------------------
-- 0084 — un numéro de candidat ne se porte qu'une fois par loge
--
-- Ce que ça change : dans une même loge, deux dossiers ne peuvent plus porter
-- le même numéro. La base le refuse, quelle que soit la porte par laquelle on
-- entre — l'application, un import, une écriture à la main.
--
-- POURQUOI
--
-- Jusqu'ici l'unicité ne tenait qu'à une habitude : seules deux fonctions
-- ouvrent un dossier, et elles verrouillent la loge (0083). Rien n'empêchait
-- une autre écriture de poser un doublon, sans erreur ni trace. Le numéro se
-- lit sur les comptes rendus et les affichettes de la commission : deux
-- candidats sous le même numéro, c'est un candidat pris pour un autre.
--
-- BUBBLE NUMÉROTE ENCORE, ET C'EST LUI QUI GARDE SON NUMÉRO
--
-- Jusqu'à la bascule, Bubble ouvre des dossiers de son côté, avec sa propre
-- suite. Un candidat y prendra tôt ou tard un numéro déjà porté par un dossier
-- ouvert dans HERACLES. À la reprise, la règle est tranchée : **le dossier
-- venu de Bubble garde son numéro**, celui ouvert dans HERACLES est renuméroté
-- à la suite de sa loge. Bubble ne se modifie pas ; c'est HERACLES qui cède.
--
-- La reprise (`outils/import-bubble.mjs`) écrit les dossiers puis les rattache
-- à leur loge, en deux temps : avec l'index en place, le second s'arrêterait
-- net sur la première collision. Elle suspend donc l'unicité le temps
-- d'écrire, puis appelle `retablir_l_unicite_des_numeros()`, qui cède les
-- numéros et repose l'index.
--
-- ET SI BUBBLE CONTIENT LUI-MÊME UN DOUBLON ?
--
-- Deux dossiers de Bubble sous le même numéro dans la même loge : on ne peut
-- ni corriger Bubble, ni choisir lequel renuméroter. L'index n'est alors PAS
-- posé — la fonction le dit dans ce qu'elle rend, et la reprise l'affiche.
-- Mieux vaut une unicité absente et annoncée qu'une reprise qui s'arrête le
-- jour de la bascule. L'index se repose tout seul dès que le doublon a
-- disparu : cette migration est rejouée à chaque déploiement.
--
-- CE QUI N'EST PAS CONCERNÉ
--
-- Un dossier sans loge, ou sans numéro : il n'entre pas dans l'index. Deux
-- loges différentes ont chacune leur suite, et peuvent porter le même numéro.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Suspendre — le temps d'une reprise
-- ---------------------------------------------------------------------------
create or replace function public.suspendre_l_unicite_des_numeros()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  drop index if exists public.candidat_numero_par_loge_unique;
end;
$$;

comment on function public.suspendre_l_unicite_des_numeros() is
  'Retire l''index d''unicité du numéro par loge, le temps que la reprise '
  'Bubble écrive ses dossiers. `retablir_l_unicite_des_numeros()` le repose.';

-- ---------------------------------------------------------------------------
-- 2. Rétablir — Bubble garde son numéro, HERACLES cède, l'index revient
-- ---------------------------------------------------------------------------
drop function if exists public.retablir_l_unicite_des_numeros();

create function public.retablir_l_unicite_des_numeros()
returns table (renumerotes integer, doublons_restants integer, unicite boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  le_dossier record;
  combien    integer := 0;
  restants   integer;
begin
  -- Personne n'ouvre de dossier pendant qu'on renumérote : sans cela, un
  -- numéro cédé à l'instant pourrait être repris par une ouverture en cours.
  lock table public.candidat in share row exclusive mode;

  -- Les dossiers qui cèdent : ouverts dans HERACLES (pas de `bubble_id`), et
  -- dont le numéro est porté dans la même loge soit par un dossier de Bubble,
  -- soit par un dossier de HERACLES plus ancien. Le plus ancien garde.
  for le_dossier in
    select c.id, c.loge_id
      from public.candidat c
     where c.loge_id is not null
       and c.numero is not null
       and c.bubble_id is null
       and (
         exists (
           select 1 from public.candidat b
            where b.loge_id = c.loge_id and b.numero = c.numero
              and b.bubble_id is not null)
         or exists (
           select 1 from public.candidat h
            where h.loge_id = c.loge_id and h.numero = c.numero
              and h.bubble_id is null
              and (coalesce(h.cree_le, '-infinity'::timestamptz), h.id)
                  < (coalesce(c.cree_le, '-infinity'::timestamptz), c.id))
       )
     order by c.loge_id, c.numero, c.cree_le nulls first, c.id
  loop
    -- À la suite de sa loge, un par un : le suivant voit le numéro du
    -- précédent, et deux dossiers cédants ne se retrouvent pas ensemble.
    update public.candidat
       set numero = (select coalesce(max(x.numero), 0) + 1
                       from public.candidat x
                      where x.loge_id = le_dossier.loge_id)
     where id = le_dossier.id;
    combien := combien + 1;
  end loop;

  -- Ce qui reste ne peut venir que de Bubble lui-même.
  select count(*) into restants
    from (
      select 1
        from public.candidat c
       where c.loge_id is not null and c.numero is not null
       group by c.loge_id, c.numero
      having count(*) > 1
    ) d;

  if restants = 0 then
    create unique index if not exists candidat_numero_par_loge_unique
      on public.candidat (loge_id, numero)
      where loge_id is not null and numero is not null;
  else
    drop index if exists public.candidat_numero_par_loge_unique;
  end if;

  return query select combien, restants, restants = 0;
end;
$$;

comment on function public.retablir_l_unicite_des_numeros() is
  'Après une reprise Bubble : un dossier ouvert dans HERACLES dont le numéro '
  'est pris par un dossier de Bubble est renuméroté à la suite de sa loge, '
  'puis l''index d''unicité est reposé. Si Bubble porte lui-même un doublon, '
  'l''index n''est pas posé et `unicite` vaut faux.';

-- Ces deux fonctions retirent et reposent une règle de la base : elles ne
-- s'appellent ni depuis l'application, ni avec la clé serveur. La reprise et
-- les migrations se connectent en propriétaire.
revoke all on function public.suspendre_l_unicite_des_numeros()
  from public, anon, authenticated, service_role;
revoke all on function public.retablir_l_unicite_des_numeros()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Poser l'unicité — maintenant, et à chaque déploiement
-- ---------------------------------------------------------------------------
select public.retablir_l_unicite_des_numeros();
