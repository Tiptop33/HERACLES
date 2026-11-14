'use client';

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { porteDesFichiers, refusDeLEcusson } from '@/lib/depot';

/**
 * Une zone où l'on peut lâcher une image d'écusson, en plus du bouton
 * « Parcourir » qu'elle contient ou qu'elle côtoie (demande du 14 novembre
 * 2026). Pendant le glisser, elle s'encadre en pointillés.
 *
 * Deux usages :
 *   * `envoyer` donné : le fichier part aussitôt — l'écusson d'une province
 *     ou d'une loge déjà enregistrée ;
 *   * `envoyer` absent : le fichier est posé dans le champ « Parcourir » de
 *     la zone, comme s'il avait été choisi — le formulaire d'ajout, qui ne
 *     l'envoie qu'avec le reste.
 *
 * Un fichier qui ne peut pas être un écusson n'est ni envoyé ni gardé : la
 * zone le dit par `refuser`. Le serveur revérifie de toute façon.
 *
 * Le dépôt est un complément pour la souris et le doigt : au clavier,
 * « Parcourir » reste le chemin.
 */
export default function ZoneDeDepot({
  children,
  className = '',
  comme = 'div',
  envoyer,
  refuser,
  tailleMaximale,
  desactivee = false,
  invite,
}: {
  children: ReactNode;
  className?: string;
  /** L'élément rendu : `label` quand la zone est le libellé du champ. */
  comme?: 'div' | 'label';
  envoyer?: (fichier: File) => void;
  refuser: (message: string) => void;
  tailleMaximale: number;
  desactivee?: boolean;
  /** Un mot montré par-dessus la zone pendant le glisser — sur une image, où l'encadré seul se voit mal. */
  invite?: string;
}) {
  const [survol, setSurvol] = useState(false);
  // dragenter et dragleave se déclenchent aussi en passant d'un enfant à
  // l'autre : on compte, pour ne pas faire clignoter l'encadré.
  const entrees = useRef(0);
  const zone = useRef<HTMLDivElement & HTMLLabelElement>(null);

  const entrer = (e: DragEvent) => {
    if (!porteDesFichiers(e.dataTransfer)) return;
    e.preventDefault();
    entrees.current += 1;
    if (!desactivee) setSurvol(true);
  };
  const survoler = (e: DragEvent) => {
    if (!porteDesFichiers(e.dataTransfer)) return;
    // Sans ceci, le navigateur refuse le dépôt — ou ouvre l'image à la place
    // de la page.
    e.preventDefault();
    e.dataTransfer.dropEffect = desactivee ? 'none' : 'copy';
  };
  const sortir = (e: DragEvent) => {
    if (!porteDesFichiers(e.dataTransfer)) return;
    entrees.current = Math.max(0, entrees.current - 1);
    if (entrees.current === 0) setSurvol(false);
  };
  const deposer = (e: DragEvent) => {
    if (!porteDesFichiers(e.dataTransfer)) return;
    e.preventDefault();
    entrees.current = 0;
    setSurvol(false);
    if (desactivee) return;

    const fichier = e.dataTransfer.files?.[0];
    if (!fichier) return;
    const refus = refusDeLEcusson(fichier, tailleMaximale);
    if (refus) {
      refuser(refus);
      return;
    }

    if (envoyer) {
      envoyer(fichier);
      return;
    }
    // Le formulaire d'ajout : le fichier prend place dans son champ, qui
    // affiche alors son nom, et part avec le reste.
    const champ = zone.current?.querySelector<HTMLInputElement>('input[type="file"]');
    try {
      const transfert = new DataTransfer();
      transfert.items.add(fichier);
      if (!champ) throw new Error('pas de champ');
      champ.files = transfert.files;
    } catch {
      refuser('Ce navigateur ne permet pas de déposer ici : utilisez « Parcourir ».');
    }
  };

  const proprietes = {
    ref: zone,
    className: `zone-de-depot${survol ? ' zone-de-depot--survol' : ''}${className ? ` ${className}` : ''}`,
    onDragEnter: entrer,
    onDragOver: survoler,
    onDragLeave: sortir,
    onDrop: deposer,
  };
  const contenu = (
    <>
      {children}
      {invite && survol && (
        <span className="zone-de-depot-invite" aria-hidden="true">
          {invite}
        </span>
      )}
    </>
  );
  return comme === 'label' ? <label {...proprietes}>{contenu}</label> : <div {...proprietes}>{contenu}</div>;
}

/**
 * Une image lâchée à côté d'une zone, le navigateur l'ouvre à la place de la
 * page : ce qu'on était en train de saisir est perdu. Sur un écran qui a des
 * zones de dépôt, ce geste-là ne fait plus rien. Un champ « Parcourir » garde
 * son comportement, et une zone qui a pris le dépôt est laissée tranquille.
 */
export function useGardeDuGlisser() {
  useEffect(() => {
    const garder = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !porteDesFichiers(e.dataTransfer)) return;
      const cible = e.target instanceof Element ? e.target : null;
      if (cible?.closest('input[type="file"]')) return;
      e.preventDefault();
      if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', garder);
    window.addEventListener('drop', garder);
    return () => {
      window.removeEventListener('dragover', garder);
      window.removeEventListener('drop', garder);
    };
  }, []);
}
