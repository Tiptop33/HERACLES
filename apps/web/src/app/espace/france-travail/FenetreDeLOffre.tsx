'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * La fenêtre du détail d'une offre (23 novembre 2026, à la demande).
 *
 * Flottante et non modale, comme « Nouveau candidat » : pas de voile, la liste
 * dessous reste lisible et cliquable — toucher une autre offre remplace le
 * détail sans passer par « fermer ». Elle se déplace par sa barre de titre et
 * se referme par la croix ou « Échap ».
 *
 * Le détail lui-même est rendu par le serveur et passé en `children` : ce
 * composant ne fait que le cadre. L'offre ouverte est dans l'adresse
 * (`?offre=…`) ; fermer, c'est y revenir sans elle.
 */

type Position = { x: number; y: number };

/** L'écart minimal avec les bords de l'écran. */
const MARGE = 16;

/** La position, ramenée dans l'écran : la fenêtre y reste entière. */
function bornee(p: Position, largeur: number, hauteur: number): Position {
  const maxX = Math.max(MARGE, window.innerWidth - largeur - MARGE);
  const maxY = Math.max(MARGE, window.innerHeight - hauteur - MARGE);
  return { x: Math.min(Math.max(MARGE, p.x), maxX), y: Math.min(Math.max(MARGE, p.y), maxY) };
}

export default function FenetreDeLOffre({
  titre,
  fermer,
  children,
}: {
  titre: string;
  /** L'adresse de l'écran sans l'offre : où mène la croix. */
  fermer: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const fenetre = useRef<HTMLDivElement>(null);
  const prise = useRef<Position | null>(null);
  // `null` tant qu'on n'a pas mesuré l'écran : la fenêtre naît à droite, par
  // le CSS, et ne prend une position chiffrée qu'au premier déplacement.
  const [position, setPosition] = useState<Position | null>(null);

  const dimensions = () => {
    const boite = fenetre.current?.getBoundingClientRect();
    return { largeur: boite?.width ?? 0, hauteur: boite?.height ?? 0 };
  };

  // L'écran tourne, la fenêtre du navigateur rétrécit : on la ramène dedans.
  useLayoutEffect(() => {
    const ramener = () =>
      setPosition((p) => {
        if (!p) return p;
        const { largeur, hauteur } = dimensions();
        return bornee(p, largeur, hauteur);
      });
    window.addEventListener('resize', ramener);
    return () => window.removeEventListener('resize', ramener);
  }, []);

  // « Échap » referme — sauf si une autre fenêtre (l'aide, un champ) a le
  // clavier et s'en sert déjà.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      router.replace(fermer, { scroll: false });
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [router, fermer]);

  // Le glisser, par la barre de titre. Pointer Events : souris, stylet, doigt.
  function saisir(e: React.PointerEvent<HTMLDivElement>) {
    // Pas depuis la croix : un clic dessus doit fermer, pas déplacer.
    if (e.button !== 0 || (e.target as HTMLElement).closest('a')) return;
    const boite = fenetre.current?.getBoundingClientRect();
    if (!boite) return;
    prise.current = { x: e.clientX - boite.left, y: e.clientY - boite.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function glisser(e: React.PointerEvent<HTMLDivElement>) {
    if (!prise.current) return;
    const { largeur, hauteur } = dimensions();
    setPosition(bornee({ x: e.clientX - prise.current.x, y: e.clientY - prise.current.y }, largeur, hauteur));
  }

  function lacher(e: React.PointerEvent<HTMLDivElement>) {
    prise.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      ref={fenetre}
      className="flottante fenetre-offre"
      role="dialog"
      aria-labelledby="fenetre-offre-titre"
      style={position ? { left: position.x, top: position.y, right: 'auto' } : undefined}
    >
      <div
        className="flottante-barre fenetre-offre-barre"
        onPointerDown={saisir}
        onPointerMove={glisser}
        onPointerUp={lacher}
        onPointerCancel={lacher}
      >
        <h2 id="fenetre-offre-titre">{titre}</h2>
        <Link href={fermer} scroll={false} className="fenetre-offre-fermer" aria-label="Fermer le détail de l’offre">
          ✕
        </Link>
      </div>
      <div className="flottante-corps">{children}</div>
    </div>
  );
}
