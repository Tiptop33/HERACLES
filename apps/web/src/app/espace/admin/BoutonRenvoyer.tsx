'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Renvoyer } from '@/components/Icones';

/**
 * Le nom de l'événement par lequel le bouton prévient la cellule « Adresse »
 * de la même ligne : c'est sous l'adresse que la confirmation se lit.
 */
export const LIEN_RENVOYE = 'heracles:lien-renvoye';

export type LienRenvoye = { id: string; message: string; reussi: boolean };

/**
 * Renvoyer le lien d'une invitation pas encore acceptée, à la même adresse.
 * Le lien part dès le clic, sans fenêtre de confirmation : c'est sans risque,
 * l'ancien lien cesse simplement de valoir. La réponse — envoyé ou refusé —
 * s'affiche sous l'adresse.
 */
export default function BoutonRenvoyer({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  const annoncer = (detail: LienRenvoye) =>
    window.dispatchEvent(new CustomEvent<LienRenvoye>(LIEN_RENVOYE, { detail }));

  async function renvoyer() {
    setEnvoi(true);
    try {
      const reponse = await fetch('/api/invitations/renvoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const resultat = await reponse.json().catch(() => ({}));
      annoncer(
        reponse.ok
          ? { id, reussi: true, message: `Nouveau lien envoyé à ${email}, valable sept jours.` }
          : { id, reussi: false, message: resultat.erreur ?? "Le lien n'a pas pu être renvoyé." },
      );
      // L'état, la date d'envoi et l'échéance viennent du serveur.
      router.refresh();
    } catch {
      annoncer({ id, reussi: false, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <button
      type="button"
      className="geste geste--renvoyer"
      aria-label={`Renvoyer le lien à ${email}`}
      title="Renvoyer le lien"
      disabled={envoi}
      onClick={renvoyer}
    >
      <Renvoyer />
    </button>
  );
}
