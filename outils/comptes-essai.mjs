#!/usr/bin/env node
// Crée les comptes du jeu d'essai sur la pile LOCALE.
//
// Depuis que l'entrée se fait sur invitation (migration 0009), on ne peut plus
// s'inscrire soi-même — et le tout premier administrateur, personne ne peut
// l'inviter. Il faut donc une porte de service, et c'est celle-ci : elle passe
// par la clé d'administration, que seule une machine de développement possède.
//
//   node outils/comptes-essai.mjs
//
// À n'employer que sur une base locale. Elle refuse de tourner ailleurs.

import { execSync } from 'node:child_process';

const COMPTES = [
  { email: 'patron@example.org', prenom: 'M', nom: 'Lo Cascio', role: 'referent', admin: true },
  { email: 'bernard@example.org', prenom: 'Bernard', nom: 'Delorme', role: 'referent' },
  { email: 'claire@example.org', prenom: 'Claire', nom: 'Vasseur', role: 'referent' },
  { email: 'michel@example.org', prenom: 'Michel', nom: 'Aubert', role: 'referent' },
];

const MOT_DE_PASSE = 'HeraclesEssai2026';

function reglages() {
  const brut = execSync('npx --yes supabase@latest status -o env', { encoding: 'utf8' });
  const lire = (cle) => brut.match(new RegExp(`^${cle}="?([^"\\n]+)"?`, 'm'))?.[1];
  return { url: lire('API_URL'), cle: lire('SERVICE_ROLE_KEY') };
}

const { url, cle } = reglages();

if (!url || !cle) {
  console.error('Pile locale introuvable. Lancez d’abord : npx supabase start');
  process.exit(1);
}

if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  console.error(`Refus : ${url} n’est pas une pile locale.`);
  process.exit(1);
}

const entete = {
  apikey: cle,
  Authorization: `Bearer ${cle}`,
  'Content-Type': 'application/json',
};

for (const compte of COMPTES) {
  const reponse = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: entete,
    body: JSON.stringify({
      email: compte.email,
      password: MOT_DE_PASSE,
      email_confirm: true,
      user_metadata: { role: compte.role, nom: compte.nom, prenom: compte.prenom },
    }),
  });

  if (reponse.status === 200) {
    console.log(`  créé      ${compte.email}`);
  } else if (reponse.status === 422) {
    console.log(`  déjà là   ${compte.email}`);
  } else {
    console.log(`  ÉCHEC     ${compte.email} — ${reponse.status} ${await reponse.text()}`);
  }
}

// Le rôle « admin » ne s'obtient pas à l'inscription : un déclencheur SQL le
// refuse. On le pose ici, sous la clé qui contourne ce garde-fou.
const posé = await fetch(`${url}/rest/v1/profil?id=eq.${''}`, { headers: entete }).catch(() => null);
void posé;

for (const compte of COMPTES.filter((c) => c.admin)) {
  const liste = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: entete });
  const { users = [] } = await liste.json();
  const trouve = users.find((u) => u.email?.toLowerCase() === compte.email);
  if (!trouve) continue;

  const maj = await fetch(`${url}/rest/v1/profil?id=eq.${trouve.id}`, {
    method: 'PATCH',
    headers: { ...entete, Prefer: 'return=minimal' },
    body: JSON.stringify({ role: 'admin' }),
  });
  console.log(maj.ok ? `  admin     ${compte.email}` : `  ÉCHEC admin ${compte.email}`);
}

console.log(`\nMot de passe de tous ces comptes : ${MOT_DE_PASSE}`);
console.log('Connexion : http://localhost:3002/connexion');
