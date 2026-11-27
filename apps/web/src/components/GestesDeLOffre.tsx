'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dateEnLettres } from '@/lib/format';
import { JOURS_EN_LIGNE, estEnLigne, valeursDeLOffre, type OffreAModifier } from '@/lib/offres-saisies';
import FenetreDeSaisieDOffre from './FenetreDeSaisieDOffre';

/**
 * Au pied du détail d'une offre saisie à la main, pour son auteur et
 * l'administration seulement (0114) : jusqu'à quand elle est en ligne, et les
 * trois gestes — la modifier, la prolonger de trente jours, la retirer.
 *
 * Rien ici ne protège : la page ne monte ce composant que si la base a rendu
 * l'offre à modifier (`offre_a_modifier`), et chaque route repasse par la
 * base, qui seule dit qui a le droit.
 *
 * Retirer est définitif : le geste demande une confirmation, sur place, sans
 * fenêtre par-dessus.
 */
export default function GestesDeLOffre({
  offre,
  apresRetrait,
}: {
  offre: OffreAModifier;
  /** L'adresse de l'écran sans l'offre : où l'on revient après l'avoir retirée. */
  apresRetrait: string;
}) {
  const router = useRouter();
  const [modifier, setModifier] = useState(false);
  const [retrait, setRetrait] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const enLigne = estEnLigne(offre);
  const fin = dateEnLettres(offre.en_ligne_jusqu_au);

  async function appeler(adresse: string, methode: 'POST' | 'DELETE', echec: string): Promise<boolean> {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch(adresse, { method: methode });
      if (!reponse.ok) {
        const lu = (await reponse.json().catch(() => ({}))) as { erreur?: string };
        setErreur(lu.erreur ?? echec);
        return false;
      }
      return true;
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  async function prolonger() {
    if (await appeler(`/api/offres/saisies/${offre.id}/prolonger`, 'POST', 'L’offre n’a pas pu être prolongée.')) {
      router.refresh();
    }
  }

  async function retirer() {
    if (await appeler(`/api/offres/saisies/${offre.id}`, 'DELETE', 'L’offre n’a pas pu être retirée.')) {
      router.replace(apresRetrait, { scroll: false });
      router.refresh();
    }
  }

  return (
    <div className="gestes-offre">
      <p className="maigre">
        {enLigne
          ? `En ligne jusqu’au ${fin ?? '…'}.`
          : `Sortie de la liste depuis le ${fin ?? '…'} : prolongez-la pour la remettre en ligne.`}
      </p>

      {retrait ? (
        <p className="gestes-offre-boutons" role="group" aria-label="Confirmer le retrait">
          <span>Retirer cette offre pour de bon ?</span>
          <button type="button" className="bouton bouton--danger bouton--petit" onClick={() => void retirer()} disabled={envoi}>
            {envoi ? 'Retrait…' : 'Oui, la retirer'}
          </button>
          <button type="button" className="bouton bouton--petit" onClick={() => setRetrait(false)} disabled={envoi}>
            Non, la garder
          </button>
        </p>
      ) : (
        <p className="gestes-offre-boutons">
          <button type="button" className="bouton bouton--petit" onClick={() => setModifier(true)} disabled={envoi}>
            Modifier
          </button>
          <button type="button" className="bouton bouton--petit" onClick={() => void prolonger()} disabled={envoi}>
            Prolonger de {JOURS_EN_LIGNE} jours
          </button>
          <button type="button" className="lien-nu gestes-offre-retirer" onClick={() => setRetrait(true)} disabled={envoi}>
            Retirer l’offre
          </button>
        </p>
      )}

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      {modifier && (
        <FenetreDeSaisieDOffre offre={offre.id} initiale={valeursDeLOffre(offre)} fermer={() => setModifier(false)} />
      )}
    </div>
  );
}
