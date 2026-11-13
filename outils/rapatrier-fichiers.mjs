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

// SEULEMENT=pdf-commission : les comptes rendus, affiches et affichettes, et
// rien d'autre — ni CV, ni photos, ni CV anonymes. C'est ce que la mise en
// ligne rapatrie à chaque fois jusqu'à la bascule, pour que l'accueil les
// ouvre depuis notre stockage (migration 0069). Le reste attend MAJBUBBLE.
//
// SEULEMENT=provinces : l'écusson de chaque province, et rien d'autre
// (`reprendre-bubble.sh --provinces`, migration 0080).
//
// SEULEMENT=loges-du-reseau : l'écusson de chaque loge du réseau reprise de
// Bubble, et rien d'autre (`reprendre-bubble.sh --loges-du-reseau`,
// migration 0094).
const SEULEMENT = process.env.SEULEMENT ?? '';
const CONNUS = ['pdf-commission', 'provinces', 'loges-du-reseau'];
if (SEULEMENT && !CONNUS.includes(SEULEMENT)) {
  console.error(`SEULEMENT=${SEULEMENT} : seules ${CONNUS.map((c) => `« ${c} »`).join(', ')} sont connues.`);
  process.exit(1);
}

if (!DATABASE_URL || !SERVICE_KEY) {
  console.error('Il manque une variable. Les trois nécessaires :');
  console.error('  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres"');
  console.error('  SUPABASE_URL="http://127.0.0.1:54331"');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="…"   (donnée par `npx supabase status`)');
  process.exit(1);
}

// table, colonne d'origine, colonne d'arrivée, dossier de rangement, et une
// condition de plus quand il en faut une. Un PDF de Bubble effacé depuis
// l'accueil (migration 0069) garde sa ligne, sans chemin : sans la condition,
// on le rapatrierait de nouveau.
const CIBLES = [
  ['candidat', 'cv_url', 'cv_chemin', 'candidat/cv'],
  ['candidat', 'cv_anonyme_url', 'cv_anonyme_chemin', 'candidat/cv-anonyme'],
  ['candidat', 'lettre_motivation_url', 'lettre_motivation_chemin', 'candidat/lettre'],
  ['candidat', 'photo_url', 'photo_chemin', 'candidat/photo'],
  ['referent', 'photo_url', 'photo_chemin', 'referent/photo'],
  ['loge', 'logo_url', 'logo_chemin', 'loge/logo'],
  // L'image de chaque province (migration 0080), affichée sur sa carte.
  ['province', 'image_url', 'image_chemin', 'province/image'],
  ['document', 'lien_url', 'chemin', 'document', 'efface_le is null'],
];

const PDF_COMMISSION = [
  [
    'document',
    'lien_url',
    'chemin',
    'document',
    "efface_le is null and lower(btrim(type_document)) in ('compte-rendu', 'affiche', 'affichette')",
  ],
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

const PROVINCES = [['province', 'image_url', 'image_chemin', 'province/image']];

// Les écussons des loges du réseau ont leur propre passe, plus bas : leur
// chemin est imposé par la table, et leur format se lit dans leurs octets.
const CHOIX = { 'pdf-commission': PDF_COMMISSION, provinces: PROVINCES, 'loges-du-reseau': [] };

for (const [table, colonneUrl, colonneChemin, dossier, condition] of SEULEMENT ? CHOIX[SEULEMENT] : CIBLES) {
  const { rows } = await client.query(
    `select id, bubble_id, ${colonneUrl} as url
       from public.${table}
      where ${colonneUrl} is not null
        and ${colonneChemin} is null
        ${condition ? `and ${condition}` : ''}
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

// ————— Les écussons des loges du réseau (migration 0094) —————
// Pas le chemin des autres fichiers : la table impose
// `loge-du-reseau/ecusson/<id de la loge>.<format>`, celui que l'écran de
// l'administration produit, et le format se lit dans les octets — comme
// lorsque l'administration dépose un écusson (`formatDImage`, lib/fichiers.ts).
// Une loge qui a déjà son écusson le garde.
const FORMATS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const TAILLE_MAXIMALE_ECUSSON = 5 * 1024 * 1024;

/** Le format d'une image, lu dans ses octets — le pendant de `formatDImage`. */
function formatDImage(octets) {
  const a = (position, ...attendus) => attendus.every((valeur, decalage) => octets[position + decalage] === valeur);
  const mot = (position) => String.fromCharCode(...octets.subarray(position, position + 4));
  if (a(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (a(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (mot(0) === 'GIF8') return 'gif';
  if (mot(0) === 'RIFF' && mot(8) === 'WEBP') return 'webp';
  if (mot(4) === 'ftyp' && ['avif', 'avis'].includes(mot(8))) return 'avif';
  return null;
}

if (!SEULEMENT || SEULEMENT === 'loges-du-reseau') {
  const { rows } = await client.query(
    `select id, bubble_id, ecusson_url as url
       from public.loge_du_reseau
      where ecusson_url is not null and ecusson_chemin is null
      order by numero`,
  );
  let faits = 0;
  let rates = 0;
  for (const ligne of rows.slice(0, LIMITE === Infinity ? undefined : LIMITE)) {
    try {
      const adresse = adresseComplete(ligne.url);
      if (!adresse) throw new Error('adresse illisible');
      const source = await fetch(adresse);
      if (!source.ok) throw new Error(`téléchargement HTTP ${source.status}`);
      const contenu = Buffer.from(await source.arrayBuffer());
      if (contenu.length > TAILLE_MAXIMALE_ECUSSON) throw new Error('plus de 5 Mo');
      const format = formatDImage(new Uint8Array(contenu));
      if (!format) throw new Error('ce n’est pas une image reconnue');

      const chemin = `loge-du-reseau/ecusson/${ligne.id}.${format}`;
      const depot = await fetch(`${SUPABASE_URL}/storage/v1/object/${SEAU}/${chemin}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': FORMATS[format], 'x-upsert': 'true' },
        body: contenu,
      });
      if (!depot.ok) throw new Error(`dépôt HTTP ${depot.status} — ${(await depot.text()).slice(0, 120)}`);

      // Un écusson déposé entre-temps par l'administration l'emporte.
      await client.query(
        'update public.loge_du_reseau set ecusson_chemin = $1 where id = $2 and ecusson_chemin is null',
        [chemin, ligne.id],
      );
      faits++;
      octets += contenu.length;
    } catch (erreur) {
      rates++;
      if (rates <= 3) console.error(`  ! loge_du_reseau ${ligne.bubble_id ?? ligne.id} : ${erreur.message}`);
    }
  }
  total += faits;
  echecs += rates;
  console.log(
    rows.length
      ? `loge_du_reseau.ecusson_url : ${faits} rapatriés${rates ? `, ${rates} en échec` : ''}`
      : 'loge_du_reseau.ecusson_url : rien à faire',
  );
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
