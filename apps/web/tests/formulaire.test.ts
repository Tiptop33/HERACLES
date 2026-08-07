import { afterEach, describe, expect, it } from 'vitest';
import { destinationInterne, origine, retourAvecCode } from '../src/lib/formulaire';

/**
 * Derrière un reverse-proxy, le serveur écoute sur `0.0.0.0:3003` et ne connaît
 * que cette adresse-là. Les redirections bâties dessus menaient le navigateur
 * vers une machine qui n'existe pas : le lien de réinitialisation reçu par
 * courriel tombait sur « la connexion a échoué ».
 */
const interne = 'http://0.0.0.0:3003/api/connexion';
const publique = 'https://essai.oaf-heracles.cloud';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('origine', () => {
  it('préfère l’adresse publique à celle de la socket', () => {
    process.env.NEXT_PUBLIC_APP_URL = publique;
    expect(origine(new Request(interne))).toBe(publique);
  });

  it('retire la barre oblique finale, qui doublerait celle du chemin', () => {
    process.env.NEXT_PUBLIC_APP_URL = `${publique}/`;
    expect(origine(new Request(interne))).toBe(publique);
  });

  it('ignore une valeur vide plutôt que de fabriquer une adresse creuse', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   ';
    expect(origine(new Request(interne))).toBe('http://0.0.0.0:3003');
  });

  it('se rabat sur la requête quand rien n’est configuré', () => {
    expect(origine(new Request('http://localhost:3002/api/connexion'))).toBe(
      'http://localhost:3002',
    );
  });

  it('ne suit pas X-Forwarded-Host, qui vient de qui fabrique la requête', () => {
    process.env.NEXT_PUBLIC_APP_URL = publique;
    const requete = new Request(interne, { headers: { 'x-forwarded-host': 'ailleurs.example' } });
    expect(origine(requete)).toBe(publique);
  });
});

describe('retourAvecCode', () => {
  it('renvoie vers l’adresse publique, et non vers la socket', () => {
    process.env.NEXT_PUBLIC_APP_URL = publique;
    const reponse = retourAvecCode(new Request(interne), '/connexion', { erreur: 'lien' });

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe(`${publique}/connexion?erreur=lien`);
  });

  it('n’ajoute pas les paramètres vides', () => {
    process.env.NEXT_PUBLIC_APP_URL = publique;
    const reponse = retourAvecCode(new Request(interne), '/connexion', { erreur: null });

    expect(reponse.headers.get('location')).toBe(`${publique}/connexion`);
  });
});

describe('destinationInterne', () => {
  it('accepte un chemin du site', () => {
    expect(destinationInterne('/espace/referent')).toBe('/espace/referent');
  });

  it('refuse une adresse absolue déguisée en chemin', () => {
    expect(destinationInterne('//ailleurs.example')).toBeNull();
  });

  it('refuse une adresse absolue', () => {
    expect(destinationInterne('https://ailleurs.example')).toBeNull();
  });
});
