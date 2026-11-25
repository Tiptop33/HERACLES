import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { envoyerUnLienDeConnexion } from '@/lib/page-candidat-serveur';

/**
 * Demander un lien de connexion — l'entrée des candidats, qui n'ont pas de mot
 * de passe (0105).
 *
 * La réponse est la même que l'adresse soit celle d'un candidat ou non, que le
 * courriel parte ou non : ce formulaire ne doit rien apprendre à personne. Elle
 * part aussi dans le même temps : le lien se fabrique et s'envoie après elle
 * (`after`), sans quoi sa durée trahirait les adresses connues.
 */

const Formulaire = z.object({
  email: z.email('Cette adresse e-mail ne se lit pas.').max(320),
});

const PAGE = '/connexion/lien';

export async function POST(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const lu = Formulaire.safeParse(await lireCorps(requete));

  if (!lu.success) {
    if (natif) return retourAvecCode(requete, PAGE, { erreur: 'adresse' });
    return NextResponse.json({ erreur: 'Cette adresse e-mail ne se lit pas.' }, { status: 400 });
  }

  const adresse = lu.data.email;
  const racine = origine(requete);
  after(async () => {
    try {
      await envoyerUnLienDeConnexion(adresse, racine);
    } catch (souci) {
      console.error('[connexion-lien] échec inattendu', (souci as Error).name);
    }
  });

  if (natif) return retourAvecCode(requete, PAGE, { envoye: '1' });
  return NextResponse.json({ ok: true });
}
