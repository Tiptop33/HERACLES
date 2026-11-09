import type { CanvasElement, Content } from 'pdfmake/interfaces';
import { create } from 'qrcode';

/**
 * Un QR code dessiné en rectangles, à la taille exacte demandée.
 *
 * pdfmake sait en dessiner un, mais arrondit la taille d'un module au point
 * entier : selon la longueur de l'adresse, le code de l'affichette ferait 75,
 * 87 ou 99 points. On le dessine donc ici, aux dimensions réglées, quelle que
 * soit l'adresse.
 *
 * Correction d'erreur « M » (15 %) : l'affichette s'imprime, se photocopie,
 * s'épingle — un code un peu abîmé doit encore se lire.
 *
 * Les modules noirs voisins sur une même ligne forment un seul rectangle :
 * moins d'objets dans le PDF, et pas de filet blanc entre deux modules quand
 * un lecteur arrondit les coordonnées.
 */
export function qrCode(texte: string, taille: number, couleur = '#000000'): Content {
  const { modules } = create(texte, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const pas = taille / n;
  // Un soupçon de recouvrement vertical, pour la même raison.
  const recouvrement = Math.min(0.05, pas / 20);

  const canvas: CanvasElement[] = [{ type: 'rect', x: 0, y: 0, w: taille, h: taille, color: '#ffffff', lineWidth: 0 }];
  for (let ligne = 0; ligne < n; ligne += 1) {
    let col = 0;
    while (col < n) {
      if (!modules.get(ligne, col)) {
        col += 1;
        continue;
      }
      let fin = col;
      while (fin + 1 < n && modules.get(ligne, fin + 1)) fin += 1;
      canvas.push({
        type: 'rect',
        x: col * pas,
        y: ligne * pas,
        w: (fin - col + 1) * pas,
        h: pas + recouvrement,
        color: couleur,
        lineWidth: 0,
      });
      col = fin + 1;
    }
  }
  return { canvas, alignment: 'center' } as Content;
}
