#!/usr/bin/env node
// Fabrique la surcharge Docker de la pile Supabase, à partir du vrai fichier.
//
//   node composer-surcharge.mjs <docker-compose.yml> <prefixe> <port-kong> > override.yml
//
// Pourquoi la calculer plutôt que l'écrire une fois pour toutes : la
// composition de Supabase change d'une version à l'autre — des services
// apparaissent, d'autres disparaissent. Une surcharge figée qui nomme un
// service absent fait échouer tout le démarrage, avec un message peu
// engageant : « service "analytics" has neither an image nor a build context ».
//
// Ce qu'elle impose, quelle que soit la version :
//
//   * chaque conteneur porte le préfixe — aucune confusion possible avec une
//     autre pile sur le même VPS, ni entre l'essai et la production ;
//   * **un seul port publié**, celui de Kong, et seulement sur 127.0.0.1.
//     Tout le reste — base, Studio, pooler — cesse d'être joignable de
//     l'extérieur. C'est Nginx qui expose, en HTTPS, et lui seul.

import { readFileSync } from 'node:fs';

const [, , chemin, prefixe, portKong, domaineApi, certresolver, routeur] = process.argv;

if (!chemin || !prefixe || !portKong) {
  console.error(
    'Usage : composer-surcharge.mjs <docker-compose.yml> <prefixe> <port-kong>' +
      ' [domaine-api] [certresolver] [nom-routeur]',
  );
  process.exit(1);
}

const texte = readFileSync(chemin, 'utf8');

// Les services sont les clés à deux espaces d'indentation, sous `services:`.
// On ne lit pas le YAML avec une bibliothèque : il n'y en a pas forcément sur
// le serveur, et cette forme-ci suffit — la composition de Supabase est plate.
const bloc = texte.split(/^services:\s*$/m)[1];
if (!bloc) {
  console.error(`Aucune section « services: » dans ${chemin}`);
  process.exit(1);
}

const services = [];
for (const ligne of bloc.split('\n')) {
  if (/^\S/.test(ligne) && ligne.trim() !== '') break; // fin de la section
  const trouve = ligne.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
  if (trouve) services.push(trouve[1]);
}

if (services.length === 0) {
  console.error(`Aucun service reconnu dans ${chemin}`);
  process.exit(1);
}

const lignes = [
  '# Fichier ENGENDRÉ par infra/supabase/composer-surcharge.mjs — ne pas modifier',
  '# à la main : il est refait à chaque installation et à chaque mise à jour, à',
  '# partir de la composition Supabase réellement présente.',
  '#',
  `# ${services.length} services détectés · préfixe « ${prefixe} » · Kong sur 127.0.0.1:${portKong}`,
  '',
  'services:',
];

// Les seuls chemins de l'API que l'application emprunte. Tout le reste est
// hors de la liste, donc hors d'atteinte — et c'est bien le sujet : Kong sert
// **Studio sur `/`**. Interdire `/studio` ne servait à rien, l'administration
// de la base était à la racine. Une liste blanche referme d'un coup ce
// qu'une liste noire laisse toujours entrouvert.
const CHEMINS = ['/auth/v1', '/rest/v1', '/storage/v1'];

for (const service of services) {
  lignes.push(`  ${service}:`);
  lignes.push(`    container_name: ${prefixe}-${service}`);
  if (service === 'kong') {
    lignes.push('    ports: !override');
    lignes.push(`      - "127.0.0.1:${portKong}:8000/tcp"`);
    if (domaineApi) lignes.push(...etiquettesTraefik());
  } else {
    // Rien d'autre ne sort. Un service qui ne publiait rien n'en souffre pas.
    lignes.push('    ports: !override []');
  }
}

// Quand un autre serveur tient déjà le port 80 du VPS, c'est lui la façade et
// Nginx n'a pas de place. Traefik découvre les services par les étiquettes de
// leurs conteneurs : on lui déclare le nôtre ici, plutôt que d'aller modifier
// sa configuration à lui — ce qui toucherait aux autres sites de la machine.
function etiquettesTraefik() {
  const nom = routeur || prefixe;
  const resolveur = certresolver || 'letsencrypt';
  const regle = `Host(\`${domaineApi}\`) && (${CHEMINS.map((c) => `PathPrefix(\`${c}\`)`).join(' || ')})`;
  const entetes = `${nom}-api-entetes`;

  return [
    '    labels:',
    '      - "traefik.enable=true"',
    `      - "traefik.http.routers.${nom}-api.rule=${regle}"`,
    `      - "traefik.http.routers.${nom}-api.entrypoints=websecure"`,
    `      - "traefik.http.routers.${nom}-api.tls.certresolver=${resolveur}"`,
    `      - "traefik.http.routers.${nom}-api.middlewares=${entetes}"`,
    `      - "traefik.http.services.${nom}-api.loadbalancer.server.port=8000"`,
    `      - "traefik.http.middlewares.${entetes}.headers.stsSeconds=31536000"`,
    `      - "traefik.http.middlewares.${entetes}.headers.stsIncludeSubdomains=true"`,
    `      - "traefik.http.middlewares.${entetes}.headers.contentTypeNosniff=true"`,
  ];
}

console.log(lignes.join('\n'));
