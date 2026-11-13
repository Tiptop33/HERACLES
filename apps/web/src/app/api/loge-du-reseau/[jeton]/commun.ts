import { NextResponse } from 'next/server';
import { empreinte } from '@/lib/invitation';
import { jetonPlausible } from '@/lib/parrainage-serveur';

/**
 * Ce que partagent les trois routes du lien d'une loge du réseau : cocher,
 * chercher, parcourir la nomenclature.
 *
 * Le Secrétaire n'a pas de compte : le jeton de l'adresse est son seul droit.
 * Un jeton qui n'en a pas la forme est refusé sans requête ; sinon, la route
 * passe son empreinte à la base, avec la clé de service, et c'est la base qui
 * dit si le lien vaut (0091). Le jeton lui-même n'atteint jamais la base.
 */

export const LIEN_MORT = 'Ce lien ne vaut plus. Demandez-en un nouveau à l’équipe HERACLES.';

/** L'empreinte du jeton, ou la réponse à rendre s'il ne ressemble pas à un jeton. */
export function empreinteDuLien(jeton: string): { ok: true; empreinte: string } | { ok: false; reponse: NextResponse } {
  if (!jetonPlausible(jeton)) {
    return { ok: false, reponse: NextResponse.json({ erreur: LIEN_MORT }, { status: 410 }) };
  }
  return { ok: true, empreinte: empreinte(jeton) };
}

/** Traduire un refus de la base. */
export function refus(etiquette: string, error: { code?: string }) {
  // 28000 : le lien ne vaut plus ; 22023 : l'empreinte n'en est pas une.
  if (error.code === '28000' || error.code === '22023') {
    return NextResponse.json({ erreur: LIEN_MORT }, { status: 410 });
  }
  console.error(`[loge du réseau] ${etiquette}`, error.code);
  return indisponible();
}

export function indisponible() {
  return NextResponse.json(
    { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
    { status: 503 },
  );
}
