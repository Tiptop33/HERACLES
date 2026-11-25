'use client';

import { useState } from 'react';

/**
 * L'adresse e-mail, et un lien en retour (0105). Même dessin que « Mot de
 * passe oublié » : la phrase qui suit l'envoi est toujours la même, que
 * l'adresse soit celle d'un candidat ou non.
 */
export default function FormulaireLien({
  erreurInitiale,
  dejaEnvoye,
}: {
  erreurInitiale?: string | null;
  dejaEnvoye?: boolean;
}) {
  const [erreur, setErreur] = useState<string | null>(erreurInitiale ?? null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(Boolean(dejaEnvoye));

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/connexion/lien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(champs.get('email') ?? '') }),
      });
      const resultat = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
      if (!reponse.ok) {
        setErreur(resultat?.erreur ?? 'L’envoi a échoué. Réessayez.');
        return;
      }
      setEnvoye(true);
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} action="/api/connexion/lien" method="post" noValidate>
      <label className={`champ${erreur ? ' champ--faux' : ''}`}>
        <span>Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required />
        {erreur && <span className="erreur-champ">{erreur}</span>}
      </label>

      <button className="bouton bouton--marque bouton--pleine-largeur" type="submit" disabled={envoi}>
        {envoi ? 'Envoi…' : envoye ? 'Renvoyer le lien' : 'Recevoir mon lien de connexion'}
      </button>

      {envoye && (
        <p className="encart" role="status">
          Si cette adresse est celle d’un espace candidat, un lien vient de partir. Il vaut trente
          minutes et ne sert qu’une fois. Rien reçu&nbsp;? Regardez dans les courriers indésirables.
        </p>
      )}
    </form>
  );
}
