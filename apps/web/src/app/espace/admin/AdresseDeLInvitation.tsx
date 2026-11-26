'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Props = {
  id: string;
  email: string;
  acceptee: boolean;
};

/** Une adresse plausible : le serveur fait foi, ceci évite seulement un aller-retour. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * La cellule « Adresse » d'une invitation, sous forme de champ. Entrée, ou un
 * clic ailleurs, enregistre ; Échap revient à l'adresse enregistrée. Pas de
 * bouton à valider, comme pour les menus « Rôle » et « Loge ».
 *
 * Ce que change l'enregistrement dépend de l'état, et c'est le serveur qui le
 * décide : une invitation pas encore acceptée repart, avec un nouveau lien, à
 * la nouvelle adresse ; une invitation acceptée change l'adresse de connexion
 * du compte. En cas de refus, le champ revient à l'ancienne adresse.
 */
export default function AdresseDeLInvitation({ id, email, acceptee }: Props) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(email);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Échap rend l'adresse puis quitte le champ : la sortie ne doit pas
  // enregistrer ce qu'on vient justement d'abandonner.
  const abandon = useRef(false);

  async function enregistrer() {
    if (abandon.current) {
      abandon.current = false;
      return;
    }
    const adresse = saisie.trim();
    if (adresse.toLowerCase() === email.toLowerCase()) {
      setSaisie(email);
      return;
    }
    if (!ADRESSE.test(adresse)) {
      setErreur("L'adresse e-mail n'est pas valide.");
      setSaisie(email);
      return;
    }

    setErreur(null);
    setEnvoi(true);
    try {
      const reponse = await fetch('/api/invitations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: adresse }),
      });
      const resultat = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setSaisie(email);
        setErreur(resultat.erreur ?? "L'adresse n'a pas pu être modifiée.");
        // Un envoi raté peut avoir changé l'état de la ligne : on la relit.
        router.refresh();
        return;
      }
      // L'état, la date d'envoi et l'échéance viennent du serveur.
      router.refresh();
    } catch {
      setSaisie(email);
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <td>
      <input
        type="email"
        aria-label={
          acceptee
            ? `Adresse de connexion du compte de ${email}`
            : `Adresse de l'invitation de ${email}`
        }
        value={saisie}
        disabled={envoi}
        autoComplete="off"
        spellCheck={false}
        style={{ fontWeight: 600, minWidth: '14rem', width: '100%' }}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={enregistrer}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            abandon.current = true;
            setSaisie(email);
            setErreur(null);
            e.currentTarget.blur();
          }
        }}
      />
      {erreur && (
        <p className="erreur" role="alert" style={{ margin: '0.3rem 0 0' }}>
          {erreur}
        </p>
      )}
    </td>
  );
}
