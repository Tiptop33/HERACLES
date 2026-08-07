'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REGLES, force, premiereFaute } from '@/lib/motdepasse';

/**
 * Les écrans 5 et 6 de la maquette, à la suite : on accepte l'invitation, puis
 * on remplit son profil. Le rôle et la loge ne se choisissent pas — ils sont
 * portés par l'invitation. C'est tout le sens de « on n'entre qu'invité ».
 */
export default function FormulaireInvitation({
  jeton,
  email,
  loge,
  role,
  inviteur,
}: {
  jeton: string;
  email: string;
  loge: string | null;
  role: string;
  inviteur: string | null;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<'invitation' | 'profil'>('invitation');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<{ champ: string | null; message: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function repondre(reponse: 'accepter' | 'refuser', corps?: Record<string, unknown>) {
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await fetch(`/api/invitations/${jeton}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reponse, ...corps }),
      });
      const resultat = await r.json();
      if (!r.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? 'Échec.' });
        return false;
      }
      router.push(resultat.redirection ?? '/connexion');
      router.refresh();
      return true;
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  // ————— Écran 5 : l'invitation —————
  if (etape === 'invitation') {
    return (
      <>
        <h1 className="entree-titre">Vous êtes invité·e</h1>

        <div className="invitation-qui">
          <span className="invitation-pastille" aria-hidden="true" />
          <div>
            <strong>{inviteur ?? 'Un administrateur'}</strong>
            <span className="maigre">{email}</span>
          </div>
        </div>

        <p className="entree-chapo">
          <strong>{inviteur ?? 'Un administrateur'}</strong> vous invite à rejoindre{' '}
          <strong>{loge ?? 'HERACLES'}</strong> avec le rôle <strong>{role}</strong>.
        </p>

        {erreur && <p className="erreur">{erreur.message}</p>}

        <button
          type="button"
          className="bouton bouton--marque bouton--pleine-largeur"
          onClick={() => setEtape('profil')}
          disabled={envoi}
        >
          Accepter l&apos;invitation
        </button>

        <button
          type="button"
          className="bouton bouton--pleine-largeur"
          style={{ marginTop: '0.6rem' }}
          onClick={() => repondre('refuser')}
          disabled={envoi}
        >
          {envoi ? 'Envoi…' : 'Refuser'}
        </button>
      </>
    );
  }

  // ————— Écran 6 : la création du compte —————
  const niveau = force(motDePasse);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const champs = new FormData(evenement.currentTarget);

    const faute = premiereFaute(motDePasse);
    if (faute) {
      setErreur({ champ: 'motDePasse', message: faute });
      return;
    }
    if (!champs.get('cgu')) {
      setErreur({ champ: 'cgu', message: 'Il faut accepter les conditions pour continuer.' });
      return;
    }

    await repondre('accepter', {
      prenom: String(champs.get('prenom') ?? ''),
      nom: String(champs.get('nom') ?? ''),
      motDePasse,
    });
  }

  return (
    <form onSubmit={soumettre} noValidate>
      {/* Trois étapes : l'invitation est acceptée, le rôle est déjà décidé par
          elle, reste le profil puis la vérification de l'adresse. */}
      <div className="etapes" role="img" aria-label="Étape 2 sur 3">
        <span className="plein" />
        <span className="plein" />
        <span />
      </div>

      <h1 className="entree-titre">Votre profil</h1>
      <p className="entree-chapo">
        Vous rejoignez <strong>{loge ?? 'HERACLES'}</strong> comme <strong>{role}</strong>.
      </p>

      {erreur && erreur.champ === null && <p className="erreur">{erreur.message}</p>}

      <div className="ligne-edition">
        <label className={`champ${erreur?.champ === 'prenom' ? ' champ--faux' : ''}`}>
          <span className="visuellement-cache">Prénom</span>
          <input name="prenom" placeholder="Prénom" autoComplete="given-name" required />
        </label>
        <label className="champ">
          <span className="visuellement-cache">Nom</span>
          <input name="nom" placeholder="Nom" autoComplete="family-name" required />
        </label>
      </div>

      <label className="champ champ--verrouille">
        <span className="visuellement-cache">Adresse e-mail</span>
        {/* L'adresse vient de l'invitation : la changer changerait de personne. */}
        <input value={email} readOnly aria-label="Adresse e-mail" />
      </label>

      <label className={`champ${erreur?.champ === 'motDePasse' ? ' champ--faux' : ''}`}>
        <span className="visuellement-cache">Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          placeholder="Mot de passe"
          autoComplete="new-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
        />
        {erreur?.champ === 'motDePasse' && <span className="erreur-champ">{erreur.message}</span>}
      </label>

      <div className="jauge-force" role="img" aria-label={`Force du mot de passe : ${niveau} sur 4`}>
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={s <= niveau ? 'plein' : ''} />
        ))}
      </div>

      <ul className="regles">
        {REGLES.map((regle) => (
          <li
            key={regle.intitule}
            className={regle.respectee && regle.respectee(motDePasse) ? 'tenue' : ''}
          >
            {regle.intitule}
          </li>
        ))}
      </ul>

      <div className={`entree-ligne${erreur?.champ === 'cgu' ? ' champ--faux' : ''}`}>
        <label>
          <input type="checkbox" name="cgu" value="oui" />
          J&apos;accepte les CGU et la politique de confidentialité
        </label>
      </div>
      {erreur?.champ === 'cgu' && <span className="erreur-champ">{erreur.message}</span>}

      <button
        type="submit"
        className="bouton bouton--marque bouton--pleine-largeur"
        style={{ marginTop: '0.8rem' }}
        disabled={envoi}
      >
        {envoi ? 'Création…' : 'Continuer'}
      </button>
    </form>
  );
}
