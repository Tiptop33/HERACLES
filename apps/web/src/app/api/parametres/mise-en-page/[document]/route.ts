import { NextResponse } from 'next/server';
import { z } from 'zod';
import { champ } from '@/lib/documents/gabarits';
import { nettoyer, verifierLeLot } from '@/lib/documents/reglages';
import { indisponible, ouvrir } from './acces';

/**
 * Enregistrer des réglages de mise en page.
 *
 * L'écran envoie ce qui vient de changer — un champ, parfois quelques-uns —,
 * jamais tout : `regler_la_mise_en_page()` (0067) fusionne, si bien que deux
 * administrateurs qui règlent chacun un champ ne s'effacent pas.
 *
 * Trois gestes :
 *   · `valeurs` — poser des valeurs ;
 *   · `retirer` — revenir à l'origine pour ces champs-là ;
 *   · `toutRetablir` — revenir à la présentation d'origine, images comprises.
 *
 * Chaque valeur est vérifiée contre le gabarit, avec un message en français ;
 * une seule fausse, et rien ne s'enregistre.
 */

const Demande = z
  .object({
    valeurs: z.record(z.string(), z.unknown()).optional(),
    retirer: z.array(z.string().max(120)).max(500).optional(),
    toutRetablir: z.boolean().optional(),
  })
  .strict();

export async function PATCH(requete: Request, { params }: { params: Promise<{ document: string }> }) {
  try {
    const acces = await ouvrir((await params).document);
    if (!acces.ok) return acces.reponse;
    const { document, supabase } = acces;

    const lu = Demande.safeParse(await requete.json().catch(() => null));
    if (!lu.success) return NextResponse.json({ erreur: 'Demande illisible.' }, { status: 400 });

    const lot = verifierLeLot(document, lu.data.valeurs ?? {});
    if (!lot.ok) return NextResponse.json({ erreur: lot.erreur }, { status: 400 });

    const retirer = lu.data.retirer ?? [];
    const inconnu = retirer.find((cle) => !champ(document, cle));
    if (inconnu) return NextResponse.json({ erreur: `Réglage inconnu : ${inconnu}.` }, { status: 400 });

    const { data, error } = await supabase.rpc('regler_la_mise_en_page', {
      document_choisi: document,
      valeurs: lot.valeurs,
      retirer,
      tout_retablir: lu.data.toutRetablir ?? false,
    });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ erreur: 'La mise en page se règle par l’administration.' }, { status: 403 });
      }
      return indisponible('réglage refusé', error);
    }

    return NextResponse.json({ ok: true, ecarts: nettoyer(document, data) });
  } catch (souci) {
    return indisponible('échec inattendu', souci);
  }
}
