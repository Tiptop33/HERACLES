'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LogeBreve } from '@/lib/administration';

const ROLES = [
  { valeur: 'referent', libelle: 'Référent — accompagne des candidats' },
  { valeur: 'chercheur', libelle: 'Candidat — tient sa propre fiche' },
  { valeur: 'admin', libelle: 'Administrateur — peut inviter à son tour' },
];

export default function FormulaireInvitation({ loges }: { loges: LogeBreve[] }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoyee, setEnvoyee] = useState<string | null>(null);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoyee(null);
    setEnvoi(true);

    const formulaire = evenement.currentTarget;
    const champs = new FormData(formulaire);
    const email = String(champs.get('email') ?? '');
    const loge = String(champs.get('loge_id') ?? '');

    try {
      const reponse = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: String(champs.get('role') ?? 'referent'),
          loge_id: loge === '' ? null : loge,
        }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? "L'invitation n'a pas pu être émise.");
        return;
      }

      setEnvoyee(email);
      formulaire.reset();
      // La liste vit côté serveur : on la fait relire plutôt que de la
      // recomposer ici, au risque qu'elle diverge de la base.
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} method="post" noValidate>
      {erreur && <p className="erreur">{erreur}</p>}

      {envoyee && (
        <p className="encart" role="status">
          Invitation envoyée à <strong>{envoyee}</strong>. Elle expire dans sept jours.
        </p>
      )}

      <div className="ligne-edition">
        <div className="champ">
          <label htmlFor="inv-email">Adresse e-mail</label>
          <input id="inv-email" name="email" type="email" autoComplete="off" required />
        </div>

        <div className="champ">
          <label htmlFor="inv-role">Rôle</label>
          <select id="inv-role" name="role" defaultValue="referent">
            {ROLES.map((r) => (
              <option key={r.valeur} value={r.valeur}>
                {r.libelle}
              </option>
            ))}
          </select>
        </div>

        <div className="champ">
          <label htmlFor="inv-loge">Loge</label>
          <select id="inv-loge" name="loge_id" defaultValue="">
            <option value="">— aucune pour l&apos;instant —</option>
            {loges.map((loge) => (
              <option key={loge.id} value={loge.id}>
                {loge.nom ?? 'Sans nom'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" className="bouton bouton--marque" disabled={envoi}>
        {envoi ? 'Envoi…' : "Envoyer l'invitation"}
      </button>
    </form>
  );
}
