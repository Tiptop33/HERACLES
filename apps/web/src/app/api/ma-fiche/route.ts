import { NextResponse } from 'next/server';
import { lireMaFiche } from '@/lib/espace-candidat-serveur';
import { FicheAuPremierEnvoi, FicheDuCandidat, premiereErreur } from '@/lib/parrainage';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le candidat enregistre sa fiche, depuis son espace.
 *
 * Tout passe par sa session : `modifier_ma_fiche()` (migration 0060) ne
 * touche que la fiche dont il est titulaire, et seulement les colonnes qu'il
 * remplit lui-même. Aucune clé service_role : il n'y a rien à contourner.
 *
 * Le consentement n'est demandé qu'au premier enregistrement — la date de
 * celui-ci en tient lieu ensuite, comme sur le lien de 0057.
 */
export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[ma-fiche] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erreur: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  }

  const fiche = await lireMaFiche();
  if (!fiche) {
    return NextResponse.json({ erreur: 'Aucune fiche n’est rattachée à ce compte.' }, { status: 403 });
  }

  const brut = await requete.json().catch(() => null);
  const schema = fiche.candidature_completee_le ? FicheDuCandidat : FicheAuPremierEnvoi;
  const lu = schema.safeParse(brut);
  if (!lu.success) {
    const { champ, message } = premiereErreur(lu.error);
    return NextResponse.json({ erreur: message, champ }, { status: 400 });
  }

  // Le consentement ne part pas en base : la date du premier envoi le porte.
  const reponses: Record<string, unknown> = { ...lu.data };
  delete reponses.consentement;
  const { error } = await supabase.rpc('modifier_ma_fiche', {
    fiche: { ...reponses, age: String(reponses.age) },
  });

  if (error) {
    console.error('[ma-fiche] enregistrement refusé', error.code);
    return NextResponse.json(
      { erreur: 'Votre fiche n’a pas pu être enregistrée. Réessayez.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
