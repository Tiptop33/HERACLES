-- ---------------------------------------------------------------------------
-- 0065 — la fiche du candidat : quatre champs obligatoires, pas un de plus
--
-- Ce que ça change : un candidat peut envoyer sa fiche avec son nom, son
-- prénom, son adresse électronique et son téléphone. Tout le reste —
-- âge, adresse, recherche, permis, parcours, et le CV lui-même — devient
-- facultatif. Décision du 9 novembre 2026 : mieux vaut une fiche courte qui
-- arrive qu'une fiche complète qui n'arrive jamais ; le référent complète
-- ensuite avec le candidat.
--
-- `completer_sa_candidature` (0057) exigeait le CV et un type de recherche.
-- Elle exige désormais le nom, le prénom et le téléphone ; l'adresse
-- électronique, elle, existe toujours : c'est par elle que le lien est arrivé.
--
--   · le CV n'est plus exigé, mais s'il est donné, il ne peut toujours porter
--     que le nom que la route lui a fixé ;
--   · le type de recherche n'est plus exigé, mais s'il est donné, il doit
--     être l'un de la liste ; laissé vide, celui que le parrain avait choisi
--     reste en place.
--
-- Même signature, même type de retour : `create or replace` suffit, et la
-- migration se rejoue.
-- ---------------------------------------------------------------------------

create or replace function public.completer_sa_candidature(
  empreinte text,
  fiche     jsonb,
  cv        text,
  lettre    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  le_parrainage public.parrainage%rowtype;
  le_candidat   public.candidat%rowtype;
  le_type       text;
  l_age         integer;
begin
  if fiche is null or jsonb_typeof(fiche) <> 'object' then
    raise exception 'Fiche illisible' using errcode = 'check_violation';
  end if;

  select * into le_parrainage
    from public.parrainage p
   where empreinte is not null and p.jeton_candidat_empreinte = empreinte
     for update;

  if not found or le_parrainage.revoque_le is not null
     or le_parrainage.candidat_expire_le <= now() then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  select * into le_candidat from public.candidat c where c.id = le_parrainage.candidat_id for update;
  if not found or le_candidat.candidature_completee_le is not null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  -- Le CV et la lettre sont facultatifs ; donnés, ils ne peuvent porter que
  -- le nom que la route leur a fixé.
  if cv is not null
     and cv !~ ('^candidat/cv/' || le_candidat.id || '\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
    raise exception 'CV mal rangé' using errcode = 'check_violation';
  end if;

  if lettre is not null
     and lettre !~ ('^candidat/lettre/' || le_candidat.id || '\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
    raise exception 'Lettre mal rangée' using errcode = 'check_violation';
  end if;

  -- Les quatre champs obligatoires. L'adresse électronique peut rester celle
  -- de l'invitation : elle n'est jamais vide.
  if nullif(btrim(fiche ->> 'nom'), '') is null
     or nullif(btrim(fiche ->> 'prenom'), '') is null
     or nullif(btrim(fiche ->> 'telephone'), '') is null then
    raise exception 'Le nom, le prénom et le téléphone sont obligatoires' using errcode = 'check_violation';
  end if;

  if coalesce(nullif(btrim(fiche ->> 'email'), ''), le_candidat.email) is null then
    raise exception 'L''adresse électronique est obligatoire' using errcode = 'check_violation';
  end if;

  le_type := nullif(btrim(fiche ->> 'type_emploi'), '');
  if le_type is not null and not (le_type = any (public.types_de_recherche())) then
    raise exception 'Type de recherche inconnu' using errcode = 'check_violation';
  end if;

  begin
    l_age := nullif(btrim(fiche ->> 'age'), '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Âge illisible' using errcode = 'check_violation';
  end;

  if l_age is not null and (l_age < 14 or l_age > 99) then
    raise exception 'Âge hors bornes' using errcode = 'check_violation';
  end if;

  update public.candidat
     set nom                      = upper(btrim(fiche ->> 'nom')),
         prenom                   = btrim(fiche ->> 'prenom'),
         email                    = coalesce(lower(nullif(btrim(fiche ->> 'email'), '')), email),
         telephone                = btrim(fiche ->> 'telephone'),
         age                      = l_age,
         situation_familiale      = nullif(btrim(fiche ->> 'situation_familiale'), ''),
         adresse                  = nullif(btrim(fiche ->> 'adresse'), ''),
         ville                    = nullif(btrim(fiche ->> 'ville'), ''),
         code_postal              = nullif(btrim(fiche ->> 'code_postal'), ''),
         -- Laissé vide, le type que le parrain avait choisi reste en place.
         type_emploi              = coalesce(le_type, type_emploi),
         emploi_recherche         = nullif(btrim(fiche ->> 'emploi_recherche'), ''),
         definition_emploi        = nullif(btrim(fiche ->> 'definition_emploi'), ''),
         mobilite_geographique    = nullif(btrim(fiche ->> 'mobilite_geographique'), ''),
         debut_stage              = nullif(btrim(fiche ->> 'debut_stage'), '')::date,
         fin_stage                = nullif(btrim(fiche ->> 'fin_stage'), '')::date,
         permis_vl                = nullif(btrim(fiche ->> 'permis_vl'), ''),
         permis_moto              = nullif(btrim(fiche ->> 'permis_moto'), ''),
         permis_pl                = nullif(btrim(fiche ->> 'permis_pl'), ''),
         vehicule                 = nullif(btrim(fiche ->> 'vehicule'), ''),
         formations               = nullif(btrim(fiche ->> 'formations'), ''),
         experiences              = nullif(btrim(fiche ->> 'experiences'), ''),
         competences              = nullif(btrim(fiche ->> 'competences'), ''),
         informatique             = nullif(btrim(fiche ->> 'informatique'), ''),
         savoir_etre              = nullif(btrim(fiche ->> 'savoir_etre'), ''),
         centres_interet          = nullif(btrim(fiche ->> 'centres_interet'), ''),
         cv_chemin                = cv,
         lettre_motivation_chemin = lettre,
         candidature_completee_le = now(),
         maj_le                   = now()
   where id = le_candidat.id;

  return le_candidat.id;
end;
$$;

comment on function public.completer_sa_candidature(text, jsonb, text, text) is
  'Le candidat complète sa fiche par son lien. Obligatoires : nom, prénom, '
  'téléphone, et l''adresse électronique (celle de l''invitation par défaut). '
  'Tout le reste, CV compris, est facultatif (0065).';

revoke all on function public.completer_sa_candidature(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.completer_sa_candidature(text, jsonb, text, text) to service_role;
