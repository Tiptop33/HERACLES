'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * L'aperçu d'un document : ses pages, dessinées dans l'écran.
 *
 * POURQUOI PAS UN CADRE
 *
 * Le serveur envoie `X-Frame-Options: DENY` sur toutes ses réponses
 * (`infra/nginx/heracles.conf.example`) : aucune page d'HERACLES ne s'affiche
 * dans un cadre, pas même chez elle. C'est voulu — personne ne doit pouvoir
 * incruster l'application ailleurs —, et un `<iframe>` vers l'aperçu restait
 * donc blanc. Sur iPad, de toute façon, Safari n'affiche que la première page
 * d'un PDF en cadre.
 *
 * Le PDF est donc **lu** (`fetch`, même origine, aucun cadre) puis **dessiné**
 * page par page par pdf.js, le lecteur de Firefox, dans des `<canvas>`. Le
 * rendu suit la largeur du volet, à la résolution de l'écran.
 *
 * L'ancien aperçu reste affiché pendant que le nouveau se dessine : régler une
 * taille ne fait pas clignoter la page.
 */
export default function ApercuPdf({ adresse, version, titre }: { adresse: string; version: number; titre: string }) {
  const pages = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');

  useEffect(() => {
    let abandonne = false;

    (async () => {
      setEtat('chargement');
      const pdfjs = await import('pdfjs-dist');
      // Un seul fil d'exécution pour toute la page, créé à la première demande.
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
          { type: 'module' },
        );
      }

      const reponse = await fetch(`${adresse}?v=${version}`, { cache: 'no-store' });
      if (!reponse.ok) throw new Error(`aperçu : ${reponse.status}`);
      const octets = new Uint8Array(await reponse.arrayBuffer());
      if (abandonne) return;

      const chargement = pdfjs.getDocument({ data: octets });
      const document_ = await chargement.promise;
      try {
        const largeur = pages.current?.clientWidth || 400;
        const densite = window.devicePixelRatio || 1;
        const dessinees: HTMLCanvasElement[] = [];

        for (let n = 1; n <= document_.numPages; n += 1) {
          const page = await document_.getPage(n);
          const naturelle = page.getViewport({ scale: 1 });
          const vue = page.getViewport({ scale: (largeur / naturelle.width) * densite });
          const toile = document.createElement('canvas');
          toile.width = Math.floor(vue.width);
          toile.height = Math.floor(vue.height);
          toile.setAttribute('role', 'img');
          toile.setAttribute('aria-label', `${titre} — page ${n} sur ${document_.numPages}`);
          await page.render({ canvas: toile, viewport: vue }).promise;
          if (abandonne) return;
          dessinees.push(toile);
        }

        if (abandonne || !pages.current) return;
        pages.current.replaceChildren(...dessinees);
        setEtat('pret');
      } finally {
        void chargement.destroy();
      }
    })().catch((souci) => {
      console.error('[mise-en-page] aperçu', souci);
      if (!abandonne) setEtat('erreur');
    });

    return () => {
      abandonne = true;
    };
  }, [adresse, version, titre]);

  return (
    <div className="mise-en-page-cadre" aria-busy={etat === 'chargement'}>
      {etat === 'erreur' && (
        <p className="mise-en-page-faute" role="alert">
          L’aperçu n’a pas pu s’afficher ici. « Ouvrir l’aperçu » le montre dans un nouvel onglet.
        </p>
      )}
      <div ref={pages} className="mise-en-page-pages" />
    </div>
  );
}
