#!/usr/bin/env node
// Crée le tout premier administrateur de HERACLES.
//
// C'est le paradoxe de l'invitation seule : on n'entre qu'invité, et personne
// ne peut inviter le premier. Cet outil ouvre cette porte-là, une fois, sous la
// clé d'administration — et rien d'autre.
//
//   HERACLES_API_URL=https://api.heracles.example.fr \
//   SUPABASE_SERVICE_ROLE_KEY=<la clé> \
//     node outils/premier-admin.mjs prenom.nom@exemple.fr --confirmer
//
// Aucun mot de passe ne circule ici : la personne reçoit un lien et choisit le
// sien. Un mot de passe tapé dans un terminal finit dans l'historique du shell.

const [, , adresse, ...reste] = process.argv;
const confirme = reste.includes('--confirmer');

const url = process.env.HERACLES_API_URL?.replace(/\/$/, '');
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
const application = process.env.HERACLES_APP_URL?.replace(/\/$/, '') ?? '';

function stop(message) {
  console.error(message);
  process.exit(1);
}

if (!adresse || !adresse.includes('@')) {
  stop('Usage : node outils/premier-admin.mjs <adresse@email> --confirmer');
}
if (!url || !cle) {
  stop('Il manque HERACLES_API_URL ou SUPABASE_SERVICE_ROLE_KEY.');
}
if (!confirme) {
  console.error(`Cette commande va créer un ADMINISTRATEUR sur ${url}`);
  console.error(`  adresse : ${adresse}`);
  console.error('\nRelancez avec --confirmer si c’est bien ce que vous voulez.');
  process.exit(1);
}

const entete = { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };

// 1. Le compte. Sans mot de passe : la personne choisira le sien.
const creation = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: entete,
  body: JSON.stringify({ email: adresse, email_confirm: true }),
});

let compte;
if (creation.ok) {
  compte = (await creation.json()).id;
  console.log(`compte créé : ${adresse}`);
} else if (creation.status === 422) {
  // Déjà là : on se contente alors de lui donner le rôle.
  const liste = await fetch(
    `${url}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: entete },
  ).then((r) => r.json());
  compte = liste.users?.find((u) => u.email?.toLowerCase() === adresse.toLowerCase())?.id;
  if (!compte) stop('Compte existant mais introuvable — vérifiez l’adresse.');
  console.log(`compte déjà présent : ${adresse}`);
} else {
  stop(`Création refusée : ${creation.status} ${await creation.text()}`);
}

// 2. Le rôle. Un déclencheur SQL empêche de se l'attribuer depuis
//    l'application ; la clé d'administration, elle, passe.
const promotion = await fetch(`${url}/rest/v1/profil?id=eq.${compte}`, {
  method: 'PATCH',
  headers: { ...entete, Prefer: 'return=minimal' },
  body: JSON.stringify({ role: 'admin' }),
});
if (!promotion.ok) stop(`Rôle non posé : ${promotion.status} ${await promotion.text()}`);
console.log('rôle administrateur posé');

// 3. Le lien pour choisir son mot de passe.
const suite = encodeURIComponent('/nouveau-mot-de-passe');
const envoi = await fetch(`${url}/auth/v1/recover`, {
  method: 'POST',
  headers: entete,
  body: JSON.stringify({
    email: adresse,
    ...(application ? { redirect_to: `${application}/auth/callback?suite=${suite}` } : {}),
  }),
});

console.log(
  envoi.ok
    ? 'un lien vient de partir : la personne y choisira son mot de passe'
    : `ATTENTION — l’e-mail n’est pas parti (${envoi.status}). Vérifiez le SMTP,\n` +
      'puis faites « Mot de passe oublié ? » depuis la page de connexion.',
);
