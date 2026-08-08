'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ChampMotDePasse from '@/components/ChampMotDePasse';
import { REGLES, force, premiereFaute } from '@/lib/motdepasse';

type Erreur = { champ: string | null; message: string };

export default function FormulaireNouveauMotDePasse({
  erreurInitiale,
}: {
  erreurInitiale?: Erreur | null;
}) {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<Erreur | null>(erreurInitiale ?? null);
  const [envoi, setEnvoi] = useState(false);

  const niveau = force(motDePasse);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);

    // Ce contrôle-ci ne protège rien — la route refait les mêmes. Il évite
    // seulement un aller-retour pour dire ce qu'on sait déjà.
    const faute = premiereFaute(motDePasse);
    if (faute) {
      setErreur({ champ: 'motDePasse', message: faute });
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur({ champ: 'confirmation', message: 'Les deux mots de passe diffèrent.' });
      return;
    }

    setEnvoi(true);
    try {
      const reponse = await fetch('/api/nouveau-mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motDePasse, confirmation }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? "L'enregistrement a échoué." });
        return;
      }

      router.push(resultat.redirection ?? '/espace/referent');
      router.refresh();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} action="/api/nouveau-mot-de-passe" method="post" noValidate>
      {erreur && erreur.champ === null && <p className="erreur">{erreur.message}</p>}

      <ChampMotDePasse
        nom="motDePasse"
        libelle="Nouveau mot de passe"
        libelleCache
        placeholder="Nouveau mot de passe"
        autoComplete="new-password"
        valeur={motDePasse}
        surSaisie={setMotDePasse}
        erreur={erreur?.champ === 'motDePasse' ? erreur.message : null}
      />

      <ChampMotDePasse
        nom="confirmation"
        libelle="Répétez le mot de passe"
        libelleCache
        placeholder="Répétez le mot de passe"
        autoComplete="new-password"
        valeur={confirmation}
        surSaisie={setConfirmation}
        erreur={erreur?.champ === 'confirmation' ? erreur.message : null}
      />

      <div
        className="jauge-force"
        role="img"
        aria-label={`Force du mot de passe : ${niveau} sur 4`}
      >
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className={segment <= niveau ? 'plein' : ''} />
        ))}
      </div>

      <ul className="regles">
        {REGLES.map((regle) => {
          const tenue = regle.respectee ? regle.respectee(motDePasse) : null;
          return (
            <li key={regle.intitule} className={tenue ? 'tenue' : ''}>
              {regle.intitule}
            </li>
          );
        })}
      </ul>

      <button
        className="bouton bouton--marque bouton--pleine-largeur"
        type="submit"
        disabled={envoi}
      >
        {envoi ? 'Enregistrement…' : 'Enregistrer et se connecter'}
      </button>
    </form>
  );
}
