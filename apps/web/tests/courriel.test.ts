import { afterEach, describe, expect, it, vi } from 'vitest';
import { courrielConfigure, enHtml, envoyerCourriel } from '../src/lib/courriel';

describe('enHtml', () => {
  it('fait un paragraphe par bloc et un saut par ligne', () => {
    expect(enHtml('Bonjour,\n\nPremière ligne\nSeconde ligne')).toContain(
      '<p>Bonjour,</p><p>Première ligne<br>Seconde ligne</p>',
    );
  });

  it('échappe le texte des modèles, saisi librement', () => {
    const html = enHtml('<script>alert(1)</script> & « guillemets »');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('rend les liens https cliquables, et seulement eux', () => {
    const html = enHtml('Votre lien :\nhttps://heracles.example.fr/parrainage/AbC_-1');
    expect(html).toContain(
      '<a href="https://heracles.example.fr/parrainage/AbC_-1">https://heracles.example.fr/parrainage/AbC_-1</a>',
    );
    expect(enHtml('javascript:alert(1)')).not.toContain('<a ');
  });
});

describe('envoyerCourriel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ne part pas, et le dit, quand Brevo n’est pas configuré', async () => {
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('COURRIEL_EXPEDITEUR', '');
    const appel = vi.fn();
    vi.stubGlobal('fetch', appel);

    expect(courrielConfigure()).toBe(false);
    expect(await envoyerCourriel({ a: 'x@example.org', sujet: 's', texte: 't' })).toEqual({
      envoye: false,
      raison: 'non-configure',
    });
    expect(appel).not.toHaveBeenCalled();
  });

  it('appelle l’API de Brevo avec la clé, l’expéditeur et le destinataire', async () => {
    vi.stubEnv('BREVO_API_KEY', 'cle-de-test');
    vi.stubEnv('COURRIEL_EXPEDITEUR', 'commission@example.org');
    const appel = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', appel);

    const issue = await envoyerCourriel({
      a: 'parrain@example.org',
      sujet: 'Objet',
      texte: 'Texte',
      nomExpediteur: 'Pau',
      repondreA: 'paul@example.org',
    });

    expect(issue).toEqual({ envoye: true });
    const [url, options] = appel.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.headers['api-key']).toBe('cle-de-test');
    const corps = JSON.parse(options.body);
    expect(corps.sender).toEqual({ email: 'commission@example.org', name: 'Pau' });
    expect(corps.to).toEqual([{ email: 'parrain@example.org' }]);
    expect(corps.replyTo).toEqual({ email: 'paul@example.org' });
  });

  it('rend un refus de Brevo, sans lever', async () => {
    vi.stubEnv('BREVO_API_KEY', 'cle-de-test');
    vi.stubEnv('COURRIEL_EXPEDITEUR', 'commission@example.org');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    expect(await envoyerCourriel({ a: 'x@example.org', sujet: 's', texte: 't' })).toEqual({
      envoye: false,
      raison: 'refuse',
    });
  });
});
