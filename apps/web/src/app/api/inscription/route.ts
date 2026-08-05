import { NextResponse } from 'next/server';
import { retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';

/**
 * L'inscription libre est fermée depuis la migration 0009 : on n'entre qu'invité
 * par un administrateur.
 *
 * La route reste, et refuse. La supprimer ferait répondre « page inconnue » à
 * un vieux lien ou à un formulaire mis en cache ; répondre explicitement dit ce
 * qui a changé, et où aller.
 */
export async function POST(requete: Request) {
  if (vientDUnFormulaire(requete)) {
    return retourAvecCode(requete, '/inscription', {});
  }

  return NextResponse.json(
    {
      erreur:
        "HERACLES se rejoint sur invitation. Demandez un lien à l'administrateur de votre loge.",
    },
    { status: 403 },
  );
}
