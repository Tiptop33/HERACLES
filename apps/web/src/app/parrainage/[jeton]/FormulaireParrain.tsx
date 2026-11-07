'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OUI_NON, TYPES_DE_RECHERCHE } from '@/lib/parrainage';

/**
 * Le formulaire de la page `parrain` de Bubble : qui présente, qui est
 * présenté, et ce que la commission doit savoir avant d'appeler.
 *
 * `method="post"` et `action` : sans script, l'envoi arrive quand même à la
 * route, au lieu de recopier les coordonnées du candidat dans l'adresse.
 */

type Erreur = { champ: string | null; message: string };

export default function FormulaireParrain({ jeton, email }: { jeton: string; email: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const corps = Object.fromEntries(new FormData(evenement.currentTarget));

    try {
      const reponse = await fetch(`/api/parrainage/${jeton}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? 'L’envoi a échoué.' });
        // Le message est en haut du formulaire : on y remonte.
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      router.push('/merci?pour=parrain');
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  /** Les attributs d'un champ : son nom, et s'il est celui que l'erreur vise. */
  const champ = (nom: string) => ({
    id: `p-${nom}`,
    name: nom,
    'aria-invalid': erreur?.champ === nom ? true : undefined,
  });

  return (
    <form
      className="formulaire-public"
      onSubmit={soumettre}
      method="post"
      action={`/api/parrainage/${jeton}`}
      noValidate
    >
      {erreur && (
        <p className="erreur" role="alert">
          {erreur.message}
        </p>
      )}

      <fieldset>
        <legend>Vous</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="p-parrain_nom">Nom *</label>
            <input {...champ('parrain_nom')} autoComplete="family-name" required />
          </div>
          <div className="champ">
            <label htmlFor="p-parrain_prenom">Prénom</label>
            <input {...champ('parrain_prenom')} autoComplete="given-name" />
          </div>
          <div className="champ">
            <label htmlFor="p-parrain_telephone">Téléphone</label>
            <input {...champ('parrain_telephone')} type="tel" autoComplete="tel" />
          </div>
          <div className="champ">
            <label htmlFor="p-parrain_loge">Votre loge</label>
            <input {...champ('parrain_loge')} />
          </div>
        </div>
        <p className="aide">Cette invitation vous a été adressée à {email}.</p>
      </fieldset>

      <fieldset>
        <legend>Le candidat</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="p-candidat_nom">Nom *</label>
            <input {...champ('candidat_nom')} required />
          </div>
          <div className="champ">
            <label htmlFor="p-candidat_prenom">Prénom *</label>
            <input {...champ('candidat_prenom')} required />
          </div>
          <div className="champ">
            <label htmlFor="p-candidat_email">E-mail *</label>
            <input {...champ('candidat_email')} type="email" required />
          </div>
          <div className="champ">
            <label htmlFor="p-type_emploi">Type de recherche *</label>
            <select {...champ('type_emploi')} defaultValue="" required>
              <option value="" disabled>
                Choisir…
              </option>
              {TYPES_DE_RECHERCHE.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="champ">
          <label htmlFor="p-lien_parente">Votre lien avec le candidat</label>
          <input {...champ('lien_parente')} placeholder="son fils, une voisine, un ancien collègue…" />
        </div>
      </fieldset>

      <fieldset>
        <legend>Pour la commission</legend>

        <ChoixEnLigne
          nom="connait_appartenance"
          question="Le candidat connaît-il votre appartenance ? *"
          valeurs={OUI_NON}
          invalide={erreur?.champ === 'connait_appartenance'}
        />
        <ChoixEnLigne
          nom="peut_se_devoiler"
          question="Un membre de la commission peut-il se dévoiler auprès de lui ? *"
          valeurs={OUI_NON}
          invalide={erreur?.champ === 'peut_se_devoiler'}
        />
        <ChoixEnLigne
          nom="urgence"
          question="Degré d’urgence de la recherche, de 0 à 5 *"
          valeurs={['0', '1', '2', '3', '4', '5']}
          invalide={erreur?.champ === 'urgence'}
        />

        <div className="champ">
          <label htmlFor="p-urgence_motif">Pourquoi ce degré d’urgence ?</label>
          <textarea {...champ('urgence_motif')} rows={4} />
        </div>
      </fieldset>

      <p className="aide">
        Ces informations ne sont lues que par les membres de la commission de la loge, et ne sont
        jamais publiées.
      </p>

      <button type="submit" className="bouton bouton--marque bouton--pleine-largeur" disabled={envoi}>
        {envoi ? 'Envoi…' : 'Présenter le candidat'}
      </button>
    </form>
  );
}

/** Une question à réponses courtes, en boutons radio sur une ligne. */
function ChoixEnLigne({
  nom,
  question,
  valeurs,
  invalide,
}: {
  nom: string;
  question: string;
  valeurs: readonly string[];
  invalide: boolean;
}) {
  return (
    <fieldset className="choix-en-ligne" aria-invalid={invalide || undefined}>
      <legend>{question}</legend>
      <div className="choix-en-ligne-options">
        {valeurs.map((valeur) => (
          <label key={valeur}>
            <input type="radio" name={nom} value={valeur} required />
            {valeur}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
