/**
 * Recevoir un formulaire, avec ou sans JavaScript.
 *
 * Pourquoi ce fichier existe. Nos formulaires sont soumis par `fetch` depuis un
 * composant client. Mais entre l'affichage de la page et la fin de
 * l'hydratation — quelques centaines de millisecondes, bien plus sur un
 * téléphone en 3G — le navigateur ne connaît pas encore ce gestionnaire. Un
 * `<form>` sans `method` part alors **en GET**, et tout ce qu'il contient
 * atterrit dans l'adresse : l'historique du navigateur, les journaux du
 * serveur, l'en-tête `Referer` de la page suivante.
 *
 * Pour la connexion, cela voulait dire un mot de passe en clair dans l'URL.
 *
 * Les formulaires déclarent donc `method="post"` et une `action`, et les routes
 * savent lire les deux formes : le JSON de `fetch`, et les champs d'un envoi
 * natif. Le service fonctionne sans JavaScript, ce qui est aussi la meilleure
 * garantie qu'il fonctionne pendant que JavaScript charge.
 */

import { NextResponse } from 'next/server';

/** Vrai si la requête vient d'un `<form>` natif, et non de `fetch`. */
export function vientDUnFormulaire(requete: Request): boolean {
  const type = requete.headers.get('content-type') ?? '';
  return (
    type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')
  );
}

/** Le corps de la requête, qu'il arrive en JSON ou en champs de formulaire. */
export async function lireCorps(requete: Request): Promise<Record<string, unknown> | null> {
  if (vientDUnFormulaire(requete)) {
    const champs = await requete.formData().catch(() => null);
    if (!champs) return null;
    return Object.fromEntries(champs);
  }

  const json = await requete.json().catch(() => null);
  return json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
}

/**
 * Une destination à l'intérieur du site, ou `null`.
 *
 * `//ailleurs.example` est une adresse absolue déguisée : sans ce contrôle, un
 * lien fabriqué renverrait la personne hors du site juste après sa connexion.
 */
export function destinationInterne(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  if (!valeur.startsWith('/') || valeur.startsWith('//')) return null;
  return valeur;
}

/**
 * Renvoyer vers une page en signalant l'issue par un **code**, jamais par un
 * message. Un message porté par l'adresse serait un message que n'importe quel
 * lien fabriqué peut faire dire ce qu'il veut — de quoi afficher un faux
 * avertissement sur nos propres pages.
 */
export function retourAvecCode(
  requete: Request,
  chemin: string,
  parametres: Record<string, string | null>,
) {
  const adresse = new URL(chemin, requete.url);

  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur) adresse.searchParams.set(cle, valeur);
  }

  // `NextResponse` et non `Response` : ses en-têtes restent modifiables, ce qui
  // permet à Next d'y accrocher les cookies de session posés par Supabase. Une
  // réponse native scellerait la redirection sans eux, et la connexion
  // réussirait sans que personne ne soit connecté.
  //
  // 303 : la page qui suit se lit en GET, même si l'envoi était un POST. Sans
  // quoi un rafraîchissement rejouerait la soumission.
  return NextResponse.redirect(adresse, 303);
}
