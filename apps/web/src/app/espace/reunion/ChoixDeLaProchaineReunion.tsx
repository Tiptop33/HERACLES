'use client';

import { useRef } from 'react';

/**
 * La date de la prochaine réunion, dite avant de tirer le compte rendu
 * (migration 0085).
 *
 * Le champ arrive rempli : la date déjà dite, sinon celle que le calendrier
 * propose — 2e ou 4e mercredi, reporté s'il tombe un jour férié. On la corrige
 * si besoin ; elle s'enregistre dès qu'elle est complète, sans bouton.
 *
 * Rangée sous le choix de l'affichette, au-dessus des boutons des documents.
 *
 * `min` écarte les dates qui ne viennent pas après la réunion, et sert aussi
 * de garde pendant la saisie au clavier : sur ordinateur, taper l'année chiffre
 * par chiffre produit « 0002 », « 0020 »… qu'il ne faut pas envoyer. Vider le
 * champ, puis le quitter, rend la main au calcul.
 */
export default function ChoixDeLaProchaineReunion({
  reunion,
  tenueLe,
  dite,
}: {
  reunion: string;
  /** Le jour de la réunion, « AAAA-MM-JJ ». */
  tenueLe: string;
  /** La date retenue ou proposée, « AAAA-MM-JJ », ou null. */
  dite: string | null;
}) {
  const formulaire = useRef<HTMLFormElement>(null);
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initiale = dite ?? '';
  const min = lendemain(tenueLe);

  // Une courte attente : corriger le jour au clavier passe par « 1 » avant
  // « 12 », et seule la date finale doit partir.
  const envoyer = (valeur: string, aLaSortie: boolean) => {
    if (attente.current) clearTimeout(attente.current);
    if (valeur === initiale) return;
    if (valeur === '' ? !aLaSortie : valeur < min) return;
    attente.current = setTimeout(() => formulaire.current?.requestSubmit(), aLaSortie ? 0 : 900);
  };

  return (
    <form
      ref={formulaire}
      method="post"
      action={`/api/reunions/${reunion}/prochaine`}
      className="appel-affichette appel-prochaine"
      data-aide="prochaine-reunion"
    >
      <input type="hidden" name="retour" value={`/espace/reunion?appel=${reunion}`} />
      <label htmlFor="prochaine-reunion">Prochaine réunion</label>
      <input
        type="date"
        id="prochaine-reunion"
        name="prochaine"
        min={min}
        defaultValue={initiale}
        onChange={(e) => envoyer(e.currentTarget.value, false)}
        onBlur={(e) => envoyer(e.currentTarget.value, true)}
      />
      <noscript>
        <button className="bouton" type="submit">
          Retenir
        </button>
      </noscript>
    </form>
  );
}

/** Le jour qui suit « AAAA-MM-JJ », en dates civiles. */
function lendemain(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
}
