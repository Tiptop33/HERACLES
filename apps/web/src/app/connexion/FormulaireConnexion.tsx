'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BoutonGoogle from '@/components/BoutonGoogle';

/** Sur quel champ porte l'erreur — pour l'afficher sous celui-là, et pas ailleurs. */
type Erreur = { champ: 'email' | 'motDePasse' | null; message: string };

export default function FormulaireConnexion({
  suite,
  erreurInitiale,
}: {
  suite?: string;
  erreurInitiale?: Erreur | null;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<Erreur | null>(erreurInitiale ?? null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(champs.get('email') ?? ''),
          motDePasse: String(champs.get('motDePasse') ?? ''),
          rester: champs.get('rester') ? 'oui' : '',
        }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur({
          champ: resultat.champ ?? 'motDePasse',
          message: resultat.erreur ?? 'La connexion a échoué.',
        });
        return;
      }

      // Une page demandée avant la connexion l'emporte sur l'accueil du rôle,
      // à condition qu'elle soit interne au site.
      const destination =
        suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : resultat.redirection;

      router.push(destination);
      router.refresh();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  const faux = (champ: Erreur['champ']) => (erreur?.champ === champ ? ' champ--faux' : '');

  return (
    // `action` et `method` ne servent jamais quand JavaScript a pris la main —
    // `soumettre` retient l'envoi. Ils servent pendant les quelques instants où
    // il n'a pas encore chargé : sans eux, le navigateur partirait en GET et
    // écrirait le mot de passe dans l'adresse.
    <form onSubmit={soumettre} action="/api/connexion" method="post" noValidate>
      {suite && <input type="hidden" name="suite" value={suite} />}

      <label className={`champ${faux('email')}`}>
        <span>Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required />
        {erreur?.champ === 'email' && <span className="erreur-champ">{erreur.message}</span>}
      </label>

      <label className={`champ${faux('motDePasse')}`}>
        <span>Mot de passe</span>
        <input name="motDePasse" type="password" autoComplete="current-password" required />
        {erreur?.champ === 'motDePasse' && <span className="erreur-champ">{erreur.message}</span>}
      </label>

      {erreur && erreur.champ === null && <p className="erreur">{erreur.message}</p>}

      <div className="entree-ligne">
        <label>
          {/* Décochée par défaut, comme sur la maquette : la session meurt à la
              fermeture du navigateur tant qu'on ne demande pas le contraire.
              C'est le bon défaut sur un poste partagé. */}
          <input type="checkbox" name="rester" value="oui" />
          Rester connecté
        </label>
        <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </div>

      <button
        className="bouton bouton--marque bouton--pleine-largeur"
        type="submit"
        disabled={envoi}
      >
        {envoi ? 'Connexion…' : 'Se connecter'}
      </button>

      <BoutonGoogle />
    </form>
  );
}
