-- ---------------------------------------------------------------------------
-- 0066 — la photo du candidat, tirée de son CV
--
-- Ce que ça change : quand le CV du candidat contient sa photo, le
-- formulaire la lui montre après la lecture (« Remplir le formulaire à
-- partir de mon CV »). S'il la garde, elle part avec sa fiche et devient la
-- photo de son dossier — celle que la fiche du référent affiche déjà
-- (`chemin_photo_candidat`, 0019).
--
-- `completer_sa_candidature` reçoit un cinquième paramètre, `photo` : le
-- chemin où la route l'a rangée. Comme le CV et la lettre, elle ne peut
-- porter que le nom que la route lui fixe — `candidat/photo/<id>.<format>`.
-- Sans photo envoyée, celle que le dossier avait déjà reste en place.
--
-- L'ancienne signature, à quatre paramètres, est retirée : deux versions de
-- la même fonction rendraient un appel par noms ambigu. Rejouable : la
-- suppression ne vise que l'ancienne, la création remplace la nouvelle.
-- ---------------------------------------------------------------------------

drop function if exists public.completer_sa_candidature(text, jsonb, text, text);

create or replace function public.completer_sa_candidature(
  empreinte text,
  fiche     jsonb,
  cv        text,
  lettre    text default null,
  photo     text default null
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

  -- La photo tirée du CV : une image, sous le seul nom que la route lui fixe.
  if photo is not null
     and photo !~ ('^candidat/photo/' || le_candidat.id || '\.(jpg|png|webp)$') then
    raise exception 'Photo mal rangée' using errcode = 'check_violation';
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
         -- Sans photo envoyée, celle du dossier (reprise de Bubble) reste.
         photo_chemin             = coalesce(photo, photo_chemin),
         candidature_completee_le = now(),
         maj_le                   = now()
   where id = le_candidat.id;

  return le_candidat.id;
end;
$$;

comment on function public.completer_sa_candidature(text, jsonb, text, text, text) is
  'Le candidat complète sa fiche par son lien. Obligatoires : nom, prénom, '
  'téléphone, et l''adresse électronique (celle de l''invitation par défaut). '
  'Le reste est facultatif (0065) ; la photo tirée du CV aussi (0066).';

revoke all on function public.completer_sa_candidature(text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.completer_sa_candidature(text, jsonb, text, text, text) to service_role;
