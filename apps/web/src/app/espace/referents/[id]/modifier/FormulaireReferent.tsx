'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FicheAnnuaire } from '@/lib/annuaire';
import type { LogeBreve } from '@/lib/administration';
import { telephone } from '@/lib/format';

type Erreur = { champ: string | null; message: string };

/**
 * La fenêtre de modification de votre maquette, en page plutôt qu'en surcouche
 * — comme la fiche d'un candidat. Une page a une adresse : elle se partage,
 * elle se recharge, et elle fonctionne avant que JavaScript ait fini de
 * charger.
 *
 * Le champ « mot de passe » de Bubble n'y est pas, et c'est délibéré : nul ne
 * choisit celui d'un autre. Pour rendre l'accès à quelqu'un, on lui renvoie
 * une invitation.
 */
export default function FormulaireReferent({
  fiche,
  loges,
  erreurInitiale,
}: {
  fiche: FicheAnnuaire;
  loges: LogeBreve[];
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
      const reponse = await fetch(`/api/referents/${fiche.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(champs)),
      });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setErreur({ champ: null, message: resultat.erreur ?? "L'enregistrement a échoué." });
        return;
      }

      router.push(resultat.redirection ?? '/espace/referents');
      router.refresh();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form
      onSubmit={soumettre}
      action={`/api/referents/${fiche.id}`}
      method="post"
      noValidate
      className="bloc"
    >
      {erreur && <p className="erreur">{erreur.message}</p>}

      {/* Une seule colonne : les six champs se lisent de haut en bas, dans
          l'ordre où on les dirait à voix haute. */}
      <label className="champ">
        <span>Nom</span>
        <input name="nom" defaultValue={fiche.nom ?? ''} autoComplete="family-name" />
      </label>

      <label className="champ">
        <span>Prénom</span>
        <input name="prenom" defaultValue={fiche.prenom ?? ''} autoComplete="given-name" />
      </label>

      <label className="champ">
        <span>Loge</span>
        <select name="loge_id" defaultValue={fiche.loge_id ?? ''}>
          <option value="">— aucune —</option>
          {loges.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </label>

      <label className="champ">
        <span>Collège</span>
        <input name="college" defaultValue={fiche.college ?? ''} />
      </label>

      {/* Le numéro s'affiche ici comme il s'affiche sur la carte, et non tel
          que Bubble l'a enregistré : 39 fiches sur 42 en sont revenues sans
          leur zéro initial, et corriger un numéro qu'on ne reconnaît pas est
          une invitation à se tromper.

          Vous pouvez le saisir comme vous voulez — collé, pointé, avec ou sans
          indicatif : le serveur le remet en forme à l'enregistrement. */}
      <label className="champ">
        <span>Téléphone</span>
        <input
          name="telephone"
          type="tel"
          defaultValue={telephone(fiche.telephone)?.affiche ?? ''}
          inputMode="tel"
        />
      </label>

      <label className="champ">
        <span>Adresse e-mail</span>
        <input name="email" type="email" defaultValue={fiche.email ?? ''} />
      </label>

      <p className="aide">
        Le numéro se saisit comme on veut — collé, pointé, avec ou sans indicatif : il est
        enregistré au format 06&nbsp;12&nbsp;34&nbsp;56&nbsp;78.
      </p>

      <p className="aide">
        L&apos;adresse sert à rattacher cette fiche à un compte : à la création du compte, celui-ci
        rejoint la fiche qui porte la même. La changer après coup ne déplace pas un compte déjà
        rattaché.
      </p>

      <div className="fiche-actions">
        <button type="submit" className="bouton bouton--fort" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <a href="/espace/referents" className="bouton">
          Annuler
        </a>
      </div>
    </form>
  );
}
