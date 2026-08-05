'use client';

import { useState } from 'react';
import type { RoleInscription } from '@/lib/roles';
import VerifierBoiteMail from './VerifierBoiteMail';

/** Sur quel champ porte l'erreur — pour l'afficher sous celui-là, et pas ailleurs. */
type Erreur = { champ: string | null; message: string };

const CHAMPS = ['role', 'prenom', 'nom', 'email', 'motDePasse'] as const;

export default function FormulaireInscription({
  roleInitial,
  erreurInitiale,
}: {
  roleInitial: RoleInscription;
  erreurInitiale?: Erreur | null;
}) {
  const [role, setRole] = useState<RoleInscription>(roleInitial);
  const [erreur, setErreur] = useState<Erreur | null>(erreurInitiale ?? null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(CHAMPS.map((cle) => [cle, String(champs.get(cle) ?? '')])),
        ),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur({
          champ: resultat.champ ?? null,
          message: resultat.erreur ?? "L'inscription n'a pas abouti.",
        });
        return;
      }

      setEnvoye(true);
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) return <VerifierBoiteMail />;

  const faux = (champ: string) => (erreur?.champ === champ ? ' champ--faux' : '');
  const sous = (champ: string) =>
    erreur?.champ === champ ? <span className="erreur-champ">{erreur.message}</span> : null;

  return (
    // Voir FormulaireConnexion : `action` et `method` ne servent que tant que
    // JavaScript n'a pas chargé — mais sans eux, le mot de passe choisi partirait
    // dans l'adresse.
    <form onSubmit={soumettre} action="/api/inscription" method="post" noValidate>
      {erreur && erreur.champ === null && <p className="erreur">{erreur.message}</p>}

      <label className={`champ${faux('role')}`}>
        <span>Je viens pour</span>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as RoleInscription)}>
          <option value="chercheur">chercher un emploi, une alternance ou un stage</option>
          <option value="referent">accompagner des personnes en recherche</option>
        </select>
        {sous('role')}
      </label>

      <label className={`champ${faux('prenom')}`}>
        <span>Prénom</span>
        <input name="prenom" autoComplete="given-name" required />
        {sous('prenom')}
      </label>

      <label className={`champ${faux('nom')}`}>
        <span>Nom</span>
        <input name="nom" autoComplete="family-name" required />
        {sous('nom')}
      </label>

      <label className={`champ${faux('email')}`}>
        <span>Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required />
        {sous('email')}
      </label>

      <label className={`champ${faux('motDePasse')}`}>
        <span>Mot de passe</span>
        <input name="motDePasse" type="password" autoComplete="new-password" minLength={8} required />
        {sous('motDePasse') ?? <span className="aide">8 caractères au minimum.</span>}
      </label>

      <button
        className="bouton bouton--marque bouton--pleine-largeur"
        type="submit"
        disabled={envoi}
      >
        {envoi ? 'Création…' : 'Créer mon compte'}
      </button>
    </form>
  );
}
