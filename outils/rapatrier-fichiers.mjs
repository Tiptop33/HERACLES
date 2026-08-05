#!/usr/bin/env node
/**
 * Rapatrie les fichiers hébergés chez Bubble vers le stockage Supabase.
 *
 *   DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node rapatrier-fichiers.mjs
 *
 * Pour chaque fichier : on le télécharge depuis le CDN de Bubble, on le dépose
 * dans le seau « documents » (privé), puis on note son emplacement dans la
 * colonne `..._chemin`. Cette colonne est le témoin : tant qu'elle est vide, le
 * fichier reste à faire.
 *
 * Le script est donc **reprenable** : interrompu, relancé, il repart où il en
 * était sans refaire ce qui est déjà passé.
 *
 * Il n'affiche aucun nom de personne — seulement des compteurs.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54331').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEAU = process.env.SEAU ?? 'documents';
const LIMITE = process.env.LIMITE ? Number(process.env.LIMITE) : Infinity;

if (!DATABASE_URL || !SERVICE_KEY) {
  console.error('Il manque une variable. Les trois nécessaires :');
  console.error('  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres"');
  console.error('  SUPABASE_URL="http://127.0.0.1:54331"');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="…"   (donnée par `npx supabase status`)');
  process.exit(1);
}

// table, colonne d'origine, colonne d'arrivée, dossier de rangement
const CIBLES = [
  ['candidat', 'cv_url', 'cv_chemin', 'candidat/cv'],
  ['candidat', 'cv_anonyme_url', 'cv_anonyme_chemin', 'candidat/cv-anonyme'],
  ['candidat', 'lettre_motivation_url', 'lettre_motivation_chemin', 'candidat/lettre'],
  ['candidat', 'photo_url', 'photo_chemin', 'candidat/photo'],
  ['referent', 'photo_url', 'photo_chemin', 'referent/photo'],
  ['loge', 'logo_url', 'logo_chemin', 'loge/logo'],
  ['document', 'lien_url', 'chemin', 'document'],
];

/** Bubble écrit ses adresses sans protocole : //xxx.cdn.bubble.io/… */
function adresseComplete(url) {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return null;
}

/** Un nom de fichier lisible et sans surprise, tiré de l'adresse d'origine. */
function nomDeFichier(url) {
  const dernier = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '');
  const propre = dernier
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120);
  return propre || 'fichier';
}

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

console.log(`Stockage : ${SUPABASE_URL} · seau « ${SEAU} »`);
if (LIMITE !== Infinity) console.log(`⚠ limité à ${LIMITE} fichiers par genre`);
console.log();

let total = 0;
let echecs = 0;
let octets = 0;

for (const [table, colonneUrl, colonneChemin, dossier] of CIBLES) {
  const { rows } = await client.query(
    `select id, bubble_id, ${colonneUrl} as url
       from public.${table}
      where ${colonneUrl} is not null
        and ${colonneChemin} is null
      order by bubble_id`,
  );

  const aFaire = rows.slice(0, LIMITE === Infinity ? undefined : LIMITE);
  if (aFaire.length === 0) {
    console.log(`${table}.${colonneUrl} : rien à faire`);
    continue;
  }

  let faits = 0;
  let rates = 0;

  for (const ligne of aFaire) {
    const adresse = adresseComplete(ligne.url);
    if (!adresse) {
      rates++;
      continue;
    }

    try {
      const source = await fetch(adresse);
      if (!source.ok) throw new Error(`téléchargement HTTP ${source.status}`);

      const contenu = Buffer.from(await source.arrayBuffer());
      const type = source.headers.get('content-type') ?? 'application/octet-stream';
      const chemin = `${dossier}/${ligne.bubble_id}/${nomDeFichier(adresse)}`;

      const depot = await fetch(`${SUPABASE_URL}/storage/v1/object/${SEAU}/${chemin}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': type,
          'x-upsert': 'true',
        },
        body: contenu,
      });

      if (!depot.ok) {
        throw new Error(`dépôt HTTP ${depot.status} — ${(await depot.text()).slice(0, 120)}`);
      }

      await client.query(
        `update public.${table} set ${colonneChemin} = $1 where id = $2`,
        [chemin, ligne.id],
      );

      faits++;
      octets += contenu.length;
    } catch (erreur) {
      rates++;
      // L'adresse contient l'identifiant du fichier, jamais le nom de la
      // personne : on peut la montrer pour diagnostiquer.
      if (rates <= 3) console.error(`  ! ${table} ${ligne.bubble_id} : ${erreur.message}`);
    }
  }

  total += faits;
  echecs += rates;
  console.log(`${table}.${colonneUrl} : ${faits} rapatriés${rates ? `, ${rates} en échec` : ''}`);
}

console.log();
console.log(`${total} fichiers rapatriés, ${(octets / 1024 / 1024).toFixed(1)} Mo${echecs ? `, ${echecs} en échec` : ''}.`);

if (echecs) {
  console.log('Relancer rattrape les échecs passagers : ce qui est déjà passé ne sera pas refait.');
  console.log(
    'Un « téléchargement HTTP 403 » ou « 404 » qui persiste veut dire autre chose : le fichier',
  );
  console.log(
    "n'est plus sur le CDN de Bubble — supprimé, ou déclaré privé. La fiche est conservée, seul",
  );
  console.log('le fichier manque. Rien ne sert d\'insister.');
}

const { rows: reste } = await client.query(
  'select source, genre, total, restants from public.fichiers_a_rapatrier where total > 0 order by source, genre',
);
console.log('\nÉtat :');
for (const r of reste) {
  console.log(`  ${r.source} / ${r.genre} : ${r.total - r.restants} sur ${r.total}`);
}

await client.end();
