#!/usr/bin/env node
/**
 * Reprise des données de l'application Bubble « heracles-42268 » vers Supabase.
 *
 *   BUBBLE_TOKEN=xxx DATABASE_URL=postgres://... node import-bubble.mjs
 *
 * Deux passes :
 *   1. les lignes, table par table, en conservant l'identifiant Bubble ;
 *   2. les rattachements, résolus une fois que tout est là.
 *
 * Le script est rejouable : une fiche déjà reprise est mise à jour, pas
 * dupliquée (`on conflict (bubble_id)`).
 *
 * Il n'affiche JAMAIS de donnée personnelle — seulement des compteurs.
 */

import pg from 'pg';

const APP = process.env.BUBBLE_APP ?? 'heracles-42268';
const TOKEN = process.env.BUBBLE_TOKEN ?? '';
const LIMITE = process.env.LIMITE ? Number(process.env.LIMITE) : Infinity;
const DATABASE_URL = process.env.DATABASE_URL;

// L'application a deux bases distinctes : celle de l'application en service
// (« live ») et celle de l'éditeur (« version-test »). Par défaut on reprend la
// vraie, celle qui porte les 107 candidats.
//   BUBBLE_VERSION=version-test  pour lire l'autre.
const VERSION = process.env.BUBBLE_VERSION ? `/${process.env.BUBBLE_VERSION}` : '';
const RACINE = `https://${APP}.bubbleapps.io${VERSION}/api/1.1`;

if (!DATABASE_URL) {
  console.error('DATABASE_URL manquante. Exemple :');
  console.error('  DATABASE_URL=postgres://postgres:postgres@localhost:54332/postgres');
  process.exit(1);
}

// --- Conversions -----------------------------------------------------------
const txt = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const ent = (v) => (v === null || v === undefined || v === '' ? null : Math.trunc(Number(v)));
const dec = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const bool = (v) => (v === null || v === undefined ? null : Boolean(v));
const date = (v) => (v ? new Date(v).toISOString() : null);
const json = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : null);
const liste = (v) => (Array.isArray(v) && v.length ? v.map(String) : null);

// L'email d'un compte Bubble vit dans authentication.email.email.
const emailAuth = (v) => txt(v?.email?.email);

// --- Ce qu'on reprend, et où ----------------------------------------------
const PLAN = [
  {
    type: 'loges_referents',
    table: 'loge',
    champs: {
      _id: ['bubble_id', txt],
      NOM_LOGES_REFERENTS: ['nom', txt],
      LOGO_LOGES_REFERENTS: ['logo_url', txt],
      'Adresse ': ['adresse', txt],
      PROVINCE: ['province_bubble_id', txt],
      'LIEU REUNIONS': ['lieu_reunions', txt],
      'PROCHAINES REUNIONS': ['prochaine_reunion', date],
      NextCandidatNumRef: ['prochain_numero_candidat', ent],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
    // Liste de référents : alimente la table de liaison en passe 2.
    liaison: { champ: 'REFERENTS_LOGES_REFERENTS', table: 'loge_membre' },
  },
  {
    type: 'user',
    table: 'referent',
    champs: {
      _id: ['bubble_id', txt],
      'NOM ref': ['nom', txt],
      PRENOM: ['prenom', txt],
      authentication: ['email', emailAuth],
      TELEPHONE: ['telephone', txt],
      TEL: ['telephone_secondaire', txt],
      PHOTO: ['photo_url', txt],
      LOGES_REFERENTS: ['loge_bubble_id', txt],
      LOGES: ['loge_origine_bubble_id', txt],
      GRADES: ['grade', txt],
      COLLEGE: ['college', txt],
      OFFICIERS: ['officier', txt],
      APPEL: ['appel', txt],
      IMMATRICULATION: ['immatriculation', txt],
      VISITE: ['visites', ent],
      LAST_SEEN: ['derniere_visite', date],
      user_signed_up: ['inscrit', bool],
      Slug: ['slug', txt],
      Channels: ['canaux_bubble_ids', liste],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
  },
  {
    type: 'candidats',
    table: 'candidat',
    champs: {
      _id: ['bubble_id', txt],
      'NUMERO CANDIDAT': ['numero', ent],
      'NOM candidat': ['nom', txt],
      'PRENOM candidat': ['prenom', txt],
      Email: ['email', txt],
      TELEPHONE: ['telephone', txt],
      AGE: ['age', ent],
      'SITUATION FAMILIALE': ['situation_familiale', txt],
      'ADR-CANDIDAT': ['adresse', txt],
      ADRESSES: ['adresse_detail', json],
      PHOTO: ['photo_url', txt],
      'TYPE EMPLOI': ['type_emploi', txt],
      'EMPLOI RECHERCHE': ['emploi_recherche', txt],
      'DEF PRECIS EMPLOI': ['definition_emploi', txt],
      'TYPEDERECHERCHE manuel': ['type_recherche_manuel', txt],
      'PRESENTATION CAND ET EMPLOI': ['presentation', txt],
      'MOB GEO': ['mobilite_geographique', txt],
      'DEBUT-STAGE': ['debut_stage', date],
      'FIN-STAGE': ['fin_stage', date],
      FORMATIONS: ['formations', txt],
      EXPERIENCES: ['experiences', txt],
      COMPETENCES: ['competences', txt],
      'SAVOIR-ETRE': ['savoir_etre', txt],
      INFORMATIQUE: ['informatique', txt],
      'CENTRE-INTERET': ['centres_interet', txt],
      'Permis de conduire VL': ['permis_vl', txt],
      'Permis de conduire Moto': ['permis_moto', txt],
      'Permis de conduire PL': ['permis_pl', txt],
      VEHICULE: ['vehicule', txt],
      CV: ['cv_url', txt],
      'CV ANONYME': ['cv_anonyme_url', txt],
      'LETTRE DE MOTIVATION': ['lettre_motivation_url', txt],
      'LOGE-REFEND-CAND': ['loge_bubble_id', txt],
      'PARRAIN-candidat': ['parrain_bubble_id', txt],
      ParrainCandemail: ['parrain_email', txt],
      REFERENTS: ['referent_bubble_id', txt],
      APPRECIATION: ['appreciation', txt],
      CLOTURE: ['cloture', txt],
      ARCHIVER: ['archive', txt],
      'SECTEUR-ACTIVITE-CAND': ['secteur_activite_bubble_id', txt],
      'SECTEUR ACTIVITE ROME': ['secteur_activite_rome_bubble_id', txt],
      'metier-cand': ['metier_bubble_id', txt],
      'titre metier': ['titre_metier_bubble_id', txt],
      Code_NAF_Candidats: ['code_naf_bubble_id', txt],
      TACHES: ['taches_bubble_ids', liste],
      Candidat_SA: ['secteur_activite_libelle', txt],
      Candidat_METIER: ['metier_libelle', txt],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
  },
  {
    type: 'info_entreprise',
    table: 'entreprise',
    champs: {
      _id: ['bubble_id', txt],
      Nom_entreprise: ['nom', txt],
      SIRET: ['siret', txt],
      Adresse_entreprise: ['adresse_detail', json],
      offre_emp: ['propose_offre', bool],
      PUBLIER: ['publier', bool],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
  },
  {
    type: 'offreemploi',
    table: 'offre_emploi',
    champs: {
      _id: ['bubble_id', txt],
      ft_id: ['source_id', txt],
      intitule: ['intitule', txt],
      description: ['description', txt],
      appellation_libelle: ['appellation_libelle', txt],
      nature_contrat: ['nature_contrat', txt],
      type_contrat: ['type_contrat', txt],
      type_contrat_libelle: ['type_contrat_libelle', txt],
      alternance: ['alternance', bool],
      nombre_postes: ['nombre_postes', ent],
      duree_travail_libelle: ['duree_travail_libelle', txt],
      duree_travail_type: ['duree_travail_type', txt],
      qualification_libelle: ['qualification_libelle', txt],
      salaire_libelle: ['salaire_libelle', txt],
      experience_exige: ['experience_exige', txt],
      experience_libelle: ['experience_libelle', txt],
      accessible_th: ['accessible_th', bool],
      entreprise_adaptee: ['entreprise_adaptee', bool],
      lieu_libelle: ['lieu_libelle', txt],
      lieu_code_postal: ['lieu_code_postal', txt],
      lieu_code_insee: ['lieu_code_insee', txt],
      departement: ['departement', txt],
      lieu_latitude: ['lieu_latitude', dec],
      lieu_longitude: ['lieu_longitude', dec],
      rome_code: ['rome_code', txt],
      rome_libelle: ['rome_libelle', txt],
      code_naf: ['code_naf', txt],
      secteur_code: ['secteur_code', txt],
      secteur_libelle: ['secteur_libelle', txt],
      secteur_section: ['secteur_section_bubble_id', txt],
      entreprise_nom: ['entreprise_nom', txt],
      entreprise_description: ['entreprise_description', txt],
      entreprise_url: ['entreprise_url', txt],
      entreprise_logo_url: ['entreprise_logo_url', txt],
      entreprise_taille: ['entreprise_taille', txt],
      url_origine: ['url_origine', txt],
      date_creation: ['date_creation', date],
      date_actualisation: ['date_actualisation', date],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
  },
  {
    type: 'pdfs',
    table: 'document',
    champs: {
      _id: ['bubble_id', txt],
      nom_pdf: ['nom', txt],
      Type_doc: ['type_document', txt],
      Link: ['lien_url', txt],
      Slug: ['slug', txt],
      archive_pdf: ['archive', bool],
      LOGE_REFERENT_PDF: ['loge_bubble_id', txt],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
  },
  {
    type: 'global',
    table: 'parametre',
    champs: {
      _id: ['bubble_id', txt],
      NextCandidatNum: ['prochain_numero_candidat', ent],
      DEPART: ['date_depart', date],
      FIN: ['date_fin', date],
      DUREE: ['duree', ent],
      'PROCHAINE REUNION': ['prochaine_reunion', date],
      'LIEU REUNION': ['lieu_reunion', txt],
      'OBJET CANDIDAT': ['objet_candidat', txt],
      'MOT CANDIDATS': ['mot_candidat', txt],
      'OBJET PARRAIN': ['objet_parrain', txt],
      'MOT PARRAINS': ['mot_parrain', txt],
      'OBJET SECTEUR ACTIVITE': ['objet_secteur_activite', txt],
      'MOT SECTEUR ACTIVITE': ['mot_secteur_activite', txt],
      'MOT MANQUANT': ['objet_manquant', txt],
      'INFO MANQUANT': ['info_manquant', txt],
      'OBJET NOUVEAU MEMBRE': ['objet_nouveau_membre', txt],
      'MOT NOUVEAU MEMBRE': ['mot_nouveau_membre', txt],
      'OBJET NEW LOGE': ['objet_nouvelle_loge', txt],
      'MOT ACCOMPAGNEMENT NEW LOGE': ['mot_accompagnement_nouvelle_loge', txt],
      'OBJET EMAILCR': ['objet_compte_rendu', txt],
      'MOT EMAILCR': ['mot_compte_rendu', txt],
      'OBJET CORRESPONDANT': ['objet_correspondant', txt],
      'MOT CORRESPONDANT': ['mot_correspondant', txt],
      // L'espace en fin de nom est dans Bubble, pas une coquille : il compte.
      'OBJET-PROPOSITION ': ['objet_proposition', txt],
      'DEMANDE-PROPOSITION-OFFRE': ['demande_proposition_offre', txt],
      'OBJET RELANCE PARRAIN': ['objet_relance_parrain', txt],
      'MOT RELANCE PARAIN': ['mot_relance_parrain', txt],
      'OBJET E-MAIL OFFRE': ['objet_offre', txt],
      'MOT EMAIL OFFRE': ['mot_offre', txt],
      WHATSAPP: ['whatsapp_bubble_ids', liste],
      'Created By': ['cree_par_bubble_id', txt],
      'Created Date': ['cree_le', date],
      'Modified Date': ['maj_le', date],
    },
    ligneUnique: true, // la table parametre est verrouillée à une seule ligne
  },
];

// Les rattachements, résolus en passe 2 par l'identifiant Bubble conservé.
const LIENS = [
  ['referent', 'loge_bubble_id', 'loge', 'loge_id'],
  ['candidat', 'loge_bubble_id', 'loge', 'loge_id'],
  ['candidat', 'parrain_bubble_id', 'referent', 'parrain_id'],
  ['candidat', 'referent_bubble_id', 'referent', 'referent_id'],
  ['document', 'loge_bubble_id', 'loge', 'loge_id'],
];

// --- Lecture de Bubble -----------------------------------------------------
async function* lireType(type) {
  let curseur = 0;
  let lus = 0;

  while (lus < LIMITE) {
    const url = `${RACINE}/obj/${type}?limit=100&cursor=${curseur}`;
    const reponse = await fetch(url, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    });

    if (!reponse.ok) {
      throw new Error(`${type} : HTTP ${reponse.status} — ${reponse.statusText}`);
    }

    const { response } = await reponse.json();
    const lot = response.results ?? [];
    if (lot.length === 0) return;

    for (const objet of lot) {
      if (lus >= LIMITE) return;
      lus++;
      yield objet;
    }

    if ((response.remaining ?? 0) === 0) return;
    curseur += lot.length;
  }
}

// --- Écriture --------------------------------------------------------------
function preparer(objet, champs) {
  const ligne = {};
  for (const [cleBubble, [colonne, convertir]] of Object.entries(champs)) {
    if (!(cleBubble in objet)) continue; // Bubble omet les champs vides
    ligne[colonne] = convertir(objet[cleBubble]);
  }
  return ligne;
}

async function ecrire(client, table, ligne, ligneUnique) {
  const colonnes = Object.keys(ligne);
  if (colonnes.length === 0) return;

  if (ligneUnique) {
    colonnes.unshift('id');
    ligne = { id: true, ...ligne };
  }

  const valeurs = colonnes.map((c) => ligne[c]);
  const jetons = colonnes.map((_, i) => `$${i + 1}`);
  const majSet = colonnes
    .filter((c) => c !== 'bubble_id' && c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  const conflit = ligneUnique ? 'id' : 'bubble_id';
  const sql =
    `insert into public.${table} (${colonnes.join(', ')}) values (${jetons.join(', ')}) ` +
    (majSet ? `on conflict (${conflit}) do update set ${majSet}` : `on conflict (${conflit}) do nothing`);

  await client.query(sql, valeurs);
}

// --- Déroulé ---------------------------------------------------------------
const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

console.log(`Reprise depuis ${APP}${TOKEN ? ' (avec jeton)' : ' (sans jeton)'}`);
if (LIMITE !== Infinity) console.log(`⚠ limité à ${LIMITE} enregistrements par type`);
console.log();

const liaisons = [];
const compteurs = {};

// Passe 1 — les lignes
for (const etape of PLAN) {
  let repris = 0;
  let erreurs = 0;

  for await (const objet of lireType(etape.type)) {
    try {
      await ecrire(client, etape.table, preparer(objet, etape.champs), etape.ligneUnique);
      repris++;
    } catch (erreur) {
      erreurs++;
      // Le message d'erreur seul : jamais la ligne, qui contient des personnes.
      if (erreurs <= 3) console.error(`  ! ${etape.table} : ${erreur.message}`);
    }

    if (etape.liaison) {
      for (const cible of objet[etape.liaison.champ] ?? []) {
        liaisons.push([String(objet._id), String(cible)]);
      }
    }
  }

  compteurs[etape.table] = repris;
  console.log(`${etape.type} → ${etape.table} : ${repris} repris${erreurs ? `, ${erreurs} en échec` : ''}`);
}

// Passe 2 — les rattachements
console.log('\nRattachements :');
for (const [table, colonneBubble, cible, colonneId] of LIENS) {
  const { rowCount } = await client.query(
    `update public.${table} t
        set ${colonneId} = c.id
       from public.${cible} c
      where c.bubble_id = t.${colonneBubble}
        and t.${colonneId} is distinct from c.id`,
  );

  const { rows } = await client.query(
    `select count(*)::int as orphelins from public.${table}
      where ${colonneBubble} is not null and ${colonneId} is null`,
  );

  const orphelins = rows[0].orphelins;
  console.log(
    `  ${table}.${colonneId} : ${rowCount} résolus` +
      (orphelins ? ` — ${orphelins} sans correspondance` : ''),
  );
}

for (const [logeBubble, referentBubble] of liaisons) {
  await client.query(
    `insert into public.loge_membre (loge_id, referent_id)
     select l.id, r.id from public.loge l, public.referent r
      where l.bubble_id = $1 and r.bubble_id = $2
     on conflict do nothing`,
    [logeBubble, referentBubble],
  );
}
if (liaisons.length) console.log(`  loge_membre : ${liaisons.length} liens traités`);

// Passe 3 — tout le reste, tel quel
// L'application compte une quarantaine de types ; sept sont modélisés en tables
// propres. Les autres sont recopiés en JSON dans bubble_brut : on ne sait pas
// encore lesquels serviront, mais ce qui n'est pas repris disparaîtra avec
// l'application.
const traites = new Set(PLAN.map((e) => e.type));
let exposes = [];

try {
  const reponse = await fetch(`${RACINE}/meta`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  if (reponse.ok) exposes = (await reponse.json()).get ?? [];
} catch {
  // Sans /meta, on se contente des types modélisés.
}

const restants = exposes.filter((t) => !traites.has(t));

if (restants.length === 0) {
  console.log('\nAucun autre type exposé par l\'API.');
} else {
  console.log(`\nTypes non modélisés, recopiés tels quels (${restants.length}) :`);

  for (const type of restants) {
    let repris = 0;
    try {
      for await (const objet of lireType(type)) {
        await client.query(
          `insert into public.bubble_brut (type_bubble, bubble_id, donnees)
           values ($1, $2, $3)
           on conflict (type_bubble, bubble_id) do update
             set donnees = excluded.donnees, recupere_le = now()`,
          [type, String(objet._id), JSON.stringify(objet)],
        );
        repris++;
      }
      console.log(`  ${type} : ${repris}`);
    } catch (erreur) {
      console.error(`  ! ${type} : ${erreur.message}`);
    }
  }
}

console.log('\nReprise terminée.');
console.log(
  'Les fichiers (CV, photos, PDF) restent hébergés chez Bubble : leurs URL cesseront de',
);
console.log('répondre à la fermeture de l\'application. Leur reprise est une étape à part.');

await client.end();
