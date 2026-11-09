import { describe, expect, it } from 'vitest';
import { DOCUMENTS, champ, champsDe, defauts, documentDeLAdresse } from '../src/lib/documents/gabarits';
import { lecteur, nettoyer, verifier, verifierLeLot } from '../src/lib/documents/reglages';

describe('les gabarits', () => {
  it('ne déclarent jamais deux fois la même clé', () => {
    for (const d of DOCUMENTS) {
      const cles = champsDe(d).map((c) => c.cle);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  it('ont des valeurs d’origine que leur propre contrôle accepte', () => {
    // Sans cela, revenir à l'origine produirait un réglage refusé.
    for (const d of DOCUMENTS) {
      for (const c of champsDe(d)) {
        const verdict = verifier(c, c.defaut);
        expect(verdict, `${d} · ${c.cle}`).toEqual({ ok: true, valeur: c.defaut });
      }
    }
  });

  it('ne livrent aucune coordonnée dans leurs textes', () => {
    // Les signatures et les contacts viennent de la base (`{venerable}`,
    // `{secretaire}`) ; la liste de diffusion se saisit sur chaque
    // installation. Rien de tout cela n'est écrit dans le dépôt.
    const textes = DOCUMENTS.flatMap((d) => champsDe(d).filter((c) => c.genre === 'texte').map((c) => String(c.defaut)));
    const tout = textes.join('\n');
    expect(tout).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(tout).not.toMatch(/0\d(?:[\s.]?\d\d){4}/);
    expect(String(champ('compte_rendu', 'pied.centre.information_liste.texte')?.defaut)).toBe('');
  });

  it('retrouvent un document par son adresse', () => {
    expect(documentDeLAdresse('compte-rendu')).toBe('compte_rendu');
    expect(documentDeLAdresse('affichette')).toBe('affichette');
    expect(documentDeLAdresse('../affiche')).toBeNull();
  });
});

describe('la vérification d’un réglage', () => {
  const taille = champ('affiche', 'titre.taille')!;
  const couleur = champ('affiche', 'titre.couleur')!;
  const largeur = champ('affiche', 'dossiers.col.date.largeur')!;
  const alignement = champ('affiche', 'titre.alignement')!;
  const image = champ('affiche', 'entete.logo_gauche.image')!;

  it('accepte un nombre écrit à la française', () => {
    expect(verifier(taille, '18,5')).toEqual({ ok: true, valeur: 18.5 });
  });

  it('refuse un nombre hors bornes, avec un message en français', () => {
    const verdict = verifier(taille, 400);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.erreur).toMatch(/entre/);
  });

  it('n’accepte qu’une couleur bien formée', () => {
    expect(verifier(couleur, '#5A6792')).toEqual({ ok: true, valeur: '#5a6792' });
    expect(verifier(couleur, 'red').ok).toBe(false);
    expect(verifier(couleur, 'url(javascript:alert(1))').ok).toBe(false);
  });

  it('comprend « auto », « * » et un nombre de points pour une largeur', () => {
    expect(verifier(largeur, 'auto').ok).toBe(true);
    expect(verifier(largeur, '*').ok).toBe(true);
    expect(verifier(largeur, '55').ok).toBe(true);
    expect(verifier(largeur, '50%').ok).toBe(false);
  });

  it('s’en tient aux choix proposés', () => {
    expect(verifier(alignement, 'center').ok).toBe(true);
    expect(verifier(alignement, 'milieu').ok).toBe(false);
  });

  it('ne laisse choisir l’image que parmi l’origine et la déposée', () => {
    expect(verifier(image, 'deposee').ok).toBe(true);
    expect(verifier(image, '/etc/passwd').ok).toBe(false);
  });

  it('refuse tout le lot pour une seule clé inconnue', () => {
    const verdict = verifierLeLot('affiche', { 'titre.taille': 20, 'titre.inconnu': 1 });
    expect(verdict.ok).toBe(false);
  });
});

describe('la relecture des réglages enregistrés', () => {
  it('retombe sur l’origine pour une valeur qui ne convient plus', () => {
    expect(nettoyer('affiche', { 'titre.taille': 'énorme', 'titre.couleur': '#000000', ancienne: 1 })).toEqual({
      'titre.couleur': '#000000',
    });
  });

  it('lit la valeur réglée, sinon celle d’origine', () => {
    const r = lecteur('affiche', { 'titre.taille': 20 });
    expect(r.nombre('titre.taille')).toBe(20);
    expect(r.nombre('date.taille')).toBe(defauts('affiche')['date.taille']);
    expect(r.largeur('dossiers.col.intitule.largeur')).toBe('*');
    expect(r.largeur('dossiers.col.date.largeur')).toBe(55);
  });

  it('signale tout de suite une clé que le gabarit ne déclare pas', () => {
    expect(() => lecteur('affiche').nombre('pas.declaree')).toThrow(/non déclaré/);
  });
});
