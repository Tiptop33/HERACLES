import { describe, expect, it } from 'vitest';

describe('referentDemande', () => {
  it('ne retient qu’un identifiant bien formé', async () => {
    const { referentDemande } = await import('../src/lib/connexions');
    const id = 'AAAAAAAA-0111-0000-0000-000000000002';
    expect(referentDemande(id)).toBe(id.toLowerCase());
    expect(referentDemande([id, 'autre'])).toBe(id.toLowerCase());
    expect(referentDemande(undefined)).toBeNull();
    expect(referentDemande('')).toBeNull();
    expect(referentDemande("x' or 1=1")).toBeNull();
    expect(referentDemande(`${id}0`)).toBeNull();
  });
});
