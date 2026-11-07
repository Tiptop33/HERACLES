'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LogeBreve } from '@/lib/administration';

/**
 * Le contenu de la fenêtre « Nouveau candidat » : l'adresse du candidat, son
 * parrain, la loge du dossier.
 *
 * Une fois l'invitation partie, on revient à la page sans la fenêtre. Seul le
 * numéro du dossier passe dans l'adresse, pour le message de confirmation —
 * jamais l'e-mail du candidat, qui finirait dans l'historique du navigateur.
 */
export default function FormulaireNouveauCandidat({
  loges,
  fermer,
}: {
  loges: LogeBreve[];
  fermer: string;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<{ message: string; champ: string | null } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);
    const valeur = (nom: string) => String(champs.get(nom) ?? '');

    try {
      const reponse = await fetch('/api/candidats/inviter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: valeur('email'),
          parrain_nom: valeur('parrain_nom'),
          parrain_prenom: valeur('parrain_prenom'),
          parrain_loge: valeur('parrain_loge'),
          parrain_email: valeur('parrain_email'),
          loge_id: valeur('loge_id'),
        }),
      });

      const resultat = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur({
          message: resultat.erreur ?? 'Le dossier n’a pas pu être ouvert.',
          champ: resultat.champ ?? null,
        });
        return;
      }

      router.replace(`/espace/admin?ouvert=${encodeURIComponent(String(resultat.numero ?? ''))}`);
      router.refresh();
    } catch {
      setErreur({ message: 'La connexion au serveur a échoué. Réessayez.', champ: null });
    } finally {
      setEnvoi(false);
    }
  }

  const invalide = (champ: string) => (erreur?.champ === champ ? true : undefined);

  return (
    <form onSubmit={soumettre} method="post" noValidate>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur.message}
        </p>
      )}

      <div className="champ">
        <label htmlFor="nc-email">E-mail du candidat *</label>
        <input
          id="nc-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          autoFocus
          aria-invalid={invalide('email')}
        />
      </div>

      <fieldset className="fenetre-groupe">
        <legend>Le parrain</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="nc-parrain-nom">Nom *</label>
            <input
              id="nc-parrain-nom"
              name="parrain_nom"
              autoComplete="off"
              required
              aria-invalid={invalide('parrain_nom')}
            />
          </div>
          <div className="champ">
            <label htmlFor="nc-parrain-prenom">Prénom *</label>
            <input
              id="nc-parrain-prenom"
              name="parrain_prenom"
              autoComplete="off"
              required
              aria-invalid={invalide('parrain_prenom')}
            />
          </div>
        </div>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="nc-parrain-loge">N° de loge *</label>
            <input
              id="nc-parrain-loge"
              name="parrain_loge"
              autoComplete="off"
              required
              aria-invalid={invalide('parrain_loge')}
            />
          </div>
          <div className="champ">
            <label htmlFor="nc-parrain-email">E-mail *</label>
            <input
              id="nc-parrain-email"
              name="parrain_email"
              type="email"
              autoComplete="off"
              required
              aria-invalid={invalide('parrain_email')}
            />
          </div>
        </div>
      </fieldset>

      <div className="champ">
        <label htmlFor="nc-loge">Loge du dossier *</label>
        <select id="nc-loge" name="loge_id" defaultValue="" required aria-invalid={invalide('loge_id')}>
          <option value="" disabled>
            — choisir —
          </option>
          {loges.map((loge) => (
            <option key={loge.id} value={loge.id}>
              {loge.nom ?? 'Sans nom'}
            </option>
          ))}
        </select>
      </div>

      <div className="fenetre-gestes">
        <Link href={fermer} className="bouton">
          Annuler
        </Link>
        <button type="submit" className="bouton bouton--marque" disabled={envoi}>
          {envoi ? 'Envoi…' : "Envoyer l'invitation"}
        </button>
      </div>
    </form>
  );
}
