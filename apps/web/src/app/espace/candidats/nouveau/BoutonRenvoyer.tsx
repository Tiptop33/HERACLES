'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import LienACopier from './LienACopier';

/**
 * Renvoyer au candidat le lien vers sa fiche. Le nouveau lien remplace
 * l'ancien ; si le courriel ne part pas, il s'affiche pour être transmis.
 */
export default function BoutonRenvoyer({ candidat }: { candidat: string }) {
  const router = useRouter();
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'envoye' | 'erreur'>('repos');
  const [message, setMessage] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);

  async function renvoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEtat('envoi');
    setMessage(null);
    setLien(null);

    try {
      const reponse = await fetch(`/api/candidats/${candidat}/lien-candidature`, { method: 'POST' });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setEtat('erreur');
        setMessage(resultat.erreur ?? 'Le lien n’a pas pu être renouvelé.');
        return;
      }

      setEtat('envoye');
      if (!resultat.envoye) setLien(resultat.lien ?? null);
      router.refresh();
    } catch {
      setEtat('erreur');
      setMessage('La connexion au serveur a échoué.');
    }
  }

  return (
    <form method="post" action={`/api/candidats/${candidat}/lien-candidature`} onSubmit={renvoyer}>
      {lien ? (
        <LienACopier lien={lien} consigne="Le courriel n’est pas parti : transmettez ce lien au candidat." />
      ) : etat === 'envoye' ? (
        <span className="maigre" role="status">
          Lien renvoyé
        </span>
      ) : (
        <button type="submit" className="bouton bouton--petit" disabled={etat === 'envoi'}>
          {etat === 'envoi' ? 'Envoi…' : 'Renvoyer au candidat'}
        </button>
      )}
      {message && (
        <span className="erreur-champ" role="alert">
          {message}
        </span>
      )}
    </form>
  );
}
