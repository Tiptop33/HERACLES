-- ---------------------------------------------------------------------------
-- 0064 — le téléphone du parrain, écrit d'une seule façon
--
-- Ce que ça change : le numéro que le parrain donne sur « Présenter un
-- candidat » est rangé sous une seule forme, « 06 12 34 56 78 », quelle que
-- soit la façon dont il l'a tapé — « 0612345678 », « 06.12.34.56.78 »,
-- « +33 6 12 34 56 78 ». La fiche du candidat l'affiche donc toujours pareil,
-- et un numéro se retrouve en le cherchant.
--
-- POURQUOI EN BASE
--
-- Le formulaire refuse déjà ce qui n'est pas un numéro français (#88). Mais
-- la règle d'écriture, elle, doit valoir quel que soit le chemin qui écrit :
-- un déclencheur sur `parrainage` la porte, et elle n'existe qu'à un endroit.
--
-- CE QUI N'EST PAS UN NUMÉRO FRANÇAIS
--
-- Avant #88, le champ était libre. Un numéro saisi alors, et qui ne suit pas
-- la numérotation française, reste tel quel : le récrire, ce serait risquer
-- de le perdre.
--
-- Rejouable : la remise au propre ne touche que les lignes qui changent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La forme d'un numéro français
-- ---------------------------------------------------------------------------
create or replace function public.telephone_lisible(numero text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    -- Dix chiffres commençant par 0, ou +33 suivi du numéro sans son 0 ;
    -- espaces, points et tirets admis entre les chiffres.
    when btrim(numero) ~ '^(\+33|0)[\s.-]*[1-9]([\s.-]*[0-9]{2}){4}$' then
      regexp_replace(
        -- Les neuf derniers chiffres, précédés du 0 national.
        '0' || right(regexp_replace(numero, '[^0-9]', '', 'g'), 9),
        '^(..)(..)(..)(..)(..)$',
        '\1 \2 \3 \4 \5'
      )
    else numero
  end
$$;

comment on function public.telephone_lisible(text) is
  'Un numéro français sous sa forme lisible, « 06 12 34 56 78 » ; tout autre '
  'texte est rendu tel quel, et null reste null.';

revoke all on function public.telephone_lisible(text) from public, anon, authenticated;
grant execute on function public.telephone_lisible(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. À chaque écriture du numéro
-- ---------------------------------------------------------------------------
create or replace function public.parrainage_telephone_lisible()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.parrain_telephone := public.telephone_lisible(new.parrain_telephone);
  return new;
end;
$$;

revoke all on function public.parrainage_telephone_lisible() from public, anon, authenticated;

drop trigger if exists parrainage_telephone_lisible on public.parrainage;
create trigger parrainage_telephone_lisible
  before insert or update of parrain_telephone on public.parrainage
  for each row execute function public.parrainage_telephone_lisible();

-- ---------------------------------------------------------------------------
-- 3. Les numéros déjà enregistrés
-- ---------------------------------------------------------------------------
update public.parrainage
   set parrain_telephone = public.telephone_lisible(parrain_telephone)
 where parrain_telephone is distinct from public.telephone_lisible(parrain_telephone);
