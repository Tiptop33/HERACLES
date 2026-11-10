import Link from 'next/link';
import { notFound } from 'next/navigation';
import { lireLeSecretaireDeMaLoge } from '@/lib/documents/donnees';
import { ADRESSES, DOCUMENTS, GABARITS, documentDeLAdresse, type Reglages } from '@/lib/documents/gabarits';
import { nettoyer } from '@/lib/documents/reglages';
import { RUBRIQUES } from '@/lib/parametres';
import { supabaseServer } from '@/lib/supabase-server';
import EditeurDeMiseEnPage from '../EditeurDeMiseEnPage';

export const metadata = { title: 'Mise en page — Paramètres — HERACLES' };

/**
 * Paramètres › Mise en page, un document à la fois.
 *
 * Trois onglets — compte rendu, affiche, affichette —, chacun une adresse :
 * elle se met en favori, et le bouton « retour » ramène au document qu'on
 * réglait.
 *
 * Le layout des paramètres a déjà vérifié la session et le rôle ; la base,
 * elle, refuse toute écriture qui ne vient pas de l'administration (0067).
 */
export default async function MiseEnPageDUnDocument({ params }: { params: Promise<{ document: string }> }) {
  const document = documentDeLAdresse((await params).document);
  if (!document) notFound();

  const supabase = await supabaseServer();
  const { data } = await supabase.from('mise_en_page').select('reglages').eq('document', document).maybeSingle();
  const ecarts = nettoyer(document, (data as { reglages: unknown } | null)?.reglages);

  // Le contact du CV anonyme a pour origine l'adresse du Secrétaire de la
  // loge (0076) : le champ la montre, comme les CV l'impriment.
  const originesLues: Reglages = {};
  if (document === 'cv_anonyme') {
    const secretaire = await lireLeSecretaireDeMaLoge();
    if (secretaire) originesLues['contact.adresse'] = secretaire;
  }

  const propos = RUBRIQUES.find((r) => r.libelle === 'Mise en page')?.propos ?? '';
  const gabarit = GABARITS[document];

  return (
    <div className="mise-en-page">
      <h2>Mise en page</h2>
      <p className="aide">{propos}</p>

      <nav className="mise-en-page-onglets" aria-label="Documents">
        {DOCUMENTS.map((d) => (
          <Link
            key={d}
            href={`/espace/parametres/mise-en-page/${ADRESSES[d]}`}
            className={`mise-en-page-onglet${d === document ? ' mise-en-page-onglet--courant' : ''}`}
            aria-current={d === document ? 'page' : undefined}
          >
            {GABARITS[d].libelle}
          </Link>
        ))}
      </nav>

      <p className="aide">{gabarit.propos}</p>

      {/* La clé force un éditeur neuf à chaque onglet : les réglages en cours
          d'envoi d'un document ne passent jamais sur un autre. */}
      <EditeurDeMiseEnPage key={document} document={document} ecartsInitiaux={ecarts} originesLues={originesLues} />
    </div>
  );
}
