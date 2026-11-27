'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import ChoixDesSecteursDuCandidat from '@/components/ChoixDesSecteursDuCandidat';
import {
  ACCEPTE_PHOTO,
  SECTIONS_DE_LA_FICHE,
  TAILLE_MAXIMALE_DE_LA_PHOTO,
  demandeDesDates,
  heureDeParis,
  ordreDuStage,
  validerUnChamp,
  valeurAffichee,
  type ChampDeLaFiche,
  type CleModifiable,
  type FicheDuCandidat,
} from '@/lib/page-candidat';
import type { SecteurDuCandidat } from '@/lib/secteurs';

/**
 * « Ma fiche » (0105). Chaque champ part dès qu'on le quitte, seul : pas de
 * bouton « Enregistrer », pas de « Annuler ». Un refus s'écrit sous le champ
 * concerné, et la valeur reste là pour être corrigée.
 */
export default function FicheDuCandidatEditable({
  fiche,
  changer,
  photoChangee,
  portrait,
}: {
  fiche: FicheDuCandidat;
  changer: (maj: Partial<FicheDuCandidat>) => void;
  photoChangee: () => void;
  portrait: React.ReactNode;
}) {
  const router = useRouter();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [vus, setVus] = useState<Record<string, number>>({});
  const [etat, setEtat] = useState<string | null>(null);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const champPhoto = useRef<HTMLInputElement>(null);

  const dire = (cle: string, message: string | null) =>
    setErreurs((e) => {
      const suite = { ...e };
      if (message) suite[cle] = message;
      else delete suite[cle];
      return suite;
    });

  const enregistre = (cle: string) => {
    setVus((v) => ({ ...v, [cle]: Date.now() }));
    setEtat(`Enregistré à ${heureDeParis(new Date())}`);
  };

  async function enregistrer(cle: CleModifiable, brute: string) {
    const avant = valeurAffichee(fiche, cle);
    const verdict = validerUnChamp(cle, brute);
    if (!verdict.ok) return dire(cle, verdict.message);
    if (verdict.valeur === avant) return dire(cle, null);

    if (cle === 'debut_stage' || cle === 'fin_stage') {
      const debut = cle === 'debut_stage' ? verdict.valeur : fiche.debut_stage;
      const fin = cle === 'fin_stage' ? verdict.valeur : fiche.fin_stage;
      const desordre = ordreDuStage(debut || null, fin || null);
      if (desordre) return dire(cle, desordre);
    }

    try {
      const reponse = await fetch('/api/espace-candidat/fiche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ champ: cle, valeur: verdict.valeur }),
      });
      const lu = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
      if (!reponse.ok) return dire(cle, lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.');
    } catch {
      return dire(cle, 'Le serveur ne répond pas. Ce changement n’est pas enregistré.');
    }

    dire(cle, null);
    changer({ [cle]: cle === 'age' ? (verdict.valeur ? Number(verdict.valeur) : null) : verdict.valeur || null });
    enregistre(cle);
  }

  async function poserLaPhoto(fichier: File) {
    if (!ACCEPTE_PHOTO.split(',').includes(fichier.type)) {
      return dire('photo', 'Cette photo n’est pas reconnue : JPEG, PNG ou WebP.');
    }
    if (fichier.size > TAILLE_MAXIMALE_DE_LA_PHOTO) return dire('photo', 'La photo dépasse 2 Mo.');
    setPhotoEnCours(true);
    try {
      const donnees = new FormData();
      donnees.set('photo', fichier);
      const reponse = await fetch('/api/espace-candidat/photo', { method: 'POST', body: donnees });
      const lu = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
      if (!reponse.ok) return dire('photo', lu?.erreur ?? 'Le dépôt a échoué. Réessayez.');
      dire('photo', null);
      changer({ a_une_photo: true });
      photoChangee();
      enregistre('photo');
    } catch {
      dire('photo', 'Le serveur ne répond pas. La photo n’est pas enregistrée.');
    } finally {
      setPhotoEnCours(false);
    }
  }

  async function retirerLaPhoto() {
    setPhotoEnCours(true);
    try {
      const reponse = await fetch('/api/espace-candidat/photo', { method: 'DELETE' });
      if (!reponse.ok) return dire('photo', 'Le retrait a échoué. Réessayez.');
      dire('photo', null);
      changer({ a_une_photo: false });
      enregistre('photo');
      champPhoto.current?.focus();
    } catch {
      dire('photo', 'Le serveur ne répond pas.');
    } finally {
      setPhotoEnCours(false);
    }
  }

  async function poserLesSecteurs(codes: string[]): Promise<SecteurDuCandidat[] | string> {
    try {
      const reponse = await fetch('/api/espace-candidat/secteurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      const lu = (await reponse.json().catch(() => null)) as { secteurs?: SecteurDuCandidat[]; erreur?: string } | null;
      if (!reponse.ok || !lu?.secteurs) return lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.';
      changer({ secteurs: lu.secteurs });
      enregistre('secteurs');
      // Les offres dépendent des secteurs : le serveur les recalcule.
      router.refresh();
      return lu.secteurs;
    } catch {
      return 'Le serveur ne répond pas. Ce changement n’est pas enregistré.';
    }
  }

  const ok = (cle: string) => (
    <span className={`pc-ok${vus[cle] ? ' pc-ok--vu' : ''}`} key={vus[cle] ?? 0} aria-hidden="true">
      Enregistré
    </span>
  );
  const erreur = (cle: string) =>
    erreurs[cle] ? (
      <p className="pc-erreur" role="alert">
        {erreurs[cle]}
      </p>
    ) : null;

  function rendreChamp(c: ChampDeLaFiche) {
    if (c.stage && !demandeDesDates(fiche.type_emploi)) return null;
    const id = `pc-champ-${c.cle}`;
    const valeur = valeurAffichee(fiche, c.cle);
    const classe = `pc-champ${c.large ? ' pc-champ--large' : ''}${erreurs[c.cle] ? ' pc-champ--faux' : ''}`;

    if (c.genre === 'boutons') {
      return (
        <div className={classe} key={c.cle} data-champ={c.cle} role="group" aria-labelledby={`${id}-lib`}>
          <span className="pc-libelle" id={`${id}-lib`}>
            {c.libelle}
            {ok(c.cle)}
          </span>
          <div className="pc-choix">
            {c.options?.map((o) => (
              <button
                key={o.valeur}
                type="button"
                className="pc-puce"
                aria-pressed={valeur === o.valeur}
                onClick={() => void enregistrer(c.cle, o.valeur)}
              >
                {o.libelle}
              </button>
            ))}
          </div>
          {erreur(c.cle)}
        </div>
      );
    }

    const commun = {
      id,
      name: c.cle,
      defaultValue: valeur,
      'aria-invalid': Boolean(erreurs[c.cle]) || undefined,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void enregistrer(c.cle, e.target.value),
    };

    let saisie: React.ReactNode;
    if (c.genre === 'long') {
      saisie = <textarea {...commun} maxLength={c.max} rows={c.cle === 'definition_emploi' ? 3 : 4} />;
    } else if (c.genre === 'choix') {
      // Une valeur reprise que la liste ne propose plus reste visible : le
      // candidat la voit, et la change s'il le veut.
      const options = c.options ?? [];
      const inconnue = valeur && !options.some((o) => o.valeur === valeur);
      saisie = (
        <select
          id={id}
          name={c.cle}
          defaultValue={valeur}
          onChange={(e) => void enregistrer(c.cle, e.target.value)}
        >
          <option value="">À choisir</option>
          {inconnue && <option value={valeur}>{valeur}</option>}
          {options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      );
    } else {
      const type = c.genre === 'tel' ? 'tel' : c.genre === 'date' ? 'date' : c.genre === 'nombre' ? 'number' : 'text';
      saisie = (
        <input
          {...commun}
          type={type}
          maxLength={c.max}
          inputMode={c.genre === 'nombre' ? 'numeric' : undefined}
          min={c.genre === 'nombre' ? 14 : undefined}
          max={c.genre === 'nombre' ? 99 : undefined}
          autoComplete={AUTOCOMPLETE[c.cle]}
        />
      );
    }

    return (
      <div className={classe} key={c.cle} data-champ={c.cle}>
        <label htmlFor={id} className="pc-libelle">
          {c.libelle}
          {ok(c.cle)}
        </label>
        {saisie}
        {erreur(c.cle)}
      </div>
    );
  }

  return (
    <section
      className="pc-bloc pc-fiche"
      id="pc-fiche"
      aria-labelledby="pc-fiche-titre"
      data-aide="candidat-fiche"
    >
      <header>
        <h2 id="pc-fiche-titre">Ma fiche</h2>
        <span className="pc-enregistre" role="status">
          {etat}
        </span>
      </header>
      <p className="pc-aide">
        Chaque modification est enregistrée dès que vous quittez le champ. Votre référent et votre parrain
        voient votre fiche à jour.
      </p>

      {SECTIONS_DE_LA_FICHE.map((s, i) => (
        <details key={s.titre} open={s.ouverte}>
          <summary>{s.titre}</summary>
          <div className="pc-champs">
            {i === 0 && (
              <>
                <div
                  className="pc-champ pc-champ--large"
                  id="pc-photo"
                  data-champ="photo"
                  data-aide="candidat-photo"
                >
                  <span className="pc-libelle">
                    Ma photo
                    {ok('photo')}
                  </span>
                  <div className="pc-photo">
                    <span className="pc-portrait pc-portrait--moyen">{portrait}</span>
                    <div className="pc-photo-gestes">
                      <label className="bouton" htmlFor="pc-champ-photo">
                        {photoEnCours ? 'Envoi…' : fiche.a_une_photo ? 'Changer de photo' : 'Choisir une photo'}
                      </label>
                      <input
                        ref={champPhoto}
                        id="pc-champ-photo"
                        type="file"
                        className="visuellement-cache"
                        accept={ACCEPTE_PHOTO}
                        disabled={photoEnCours}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void poserLaPhoto(f);
                        }}
                      />
                      {fiche.a_une_photo && (
                        <button type="button" className="pc-lien pc-lien--alerte" onClick={() => void retirerLaPhoto()} disabled={photoEnCours}>
                          Retirer ma photo
                        </button>
                      )}
                      <p className="pc-note">
                        JPEG, PNG ou WebP, 2 Mo au plus. Votre référent et votre parrain la voient sur votre fiche.
                      </p>
                      {erreur('photo')}
                    </div>
                  </div>
                </div>
                <div className="pc-champ pc-champ--large">
                  <span className="pc-libelle">Adresse e-mail</span>
                  <p className="pc-valeur">{fiche.email ?? 'non renseignée'}</p>
                  <p className="pc-note">
                    Elle sert à vous connecter. Pour en changer, demandez à votre référent.
                  </p>
                </div>
              </>
            )}

            {s.champs.map((c) => (
              <FragmentDeChamp key={c.cle}>
                {rendreChamp(c)}
                {c.cle === 'definition_emploi' && (
                  <div className="pc-champ pc-champ--large" data-champ="secteurs" data-aide="candidat-secteurs">
                    <span className="pc-libelle" id="pc-champ-secteurs-lib">
                      Mes secteurs d’activité
                      {ok('secteurs')}
                    </span>
                    <div id="pc-champ-secteurs" tabIndex={-1}>
                      <ChoixDesSecteursDuCandidat
                        mode="espace"
                        initiale={fiche.secteurs}
                        idDuTitre="pc-champ-secteurs-lib"
                        adresses={{
                          recherche: '/api/espace-candidat/secteurs/recherche',
                          liste: '/api/espace-candidat/secteurs/liste',
                        }}
                        enregistrer={poserLesSecteurs}
                      />
                    </div>
                  </div>
                )}
              </FragmentDeChamp>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function FragmentDeChamp({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const AUTOCOMPLETE: Partial<Record<CleModifiable, string>> = {
  prenom: 'given-name',
  nom: 'family-name',
  telephone: 'tel',
  adresse: 'street-address',
  code_postal: 'postal-code',
  ville: 'address-level2',
};
