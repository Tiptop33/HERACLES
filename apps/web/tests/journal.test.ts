import { describe, expect, it } from 'vitest';
import { resumeDuJournal, tacheOuverte, type LigneDeJournal } from '../src/lib/journal';

/** Une ligne de journal, réduite à ce que les fonctions regardent. */
function ligne(etat: string | null): LigneDeJournal {
  return {
    id: crypto.randomUUID(),
    fait_le: '2026-03-15',
    nature: null,
    etat,
    texte: 'Relance de l’entreprise.',
    auteur_nom: 'P Paul',
    c_est_moi: false,
    cree_le: null,
  };
}

describe('tacheOuverte', () => {
  // Les cinq valeurs relevées le 8 août 2026 sur les 467 tâches de Bubble.
  it('tient pour ouvertes les tâches qui le sont', () => {
    for (const etat of ['En cours', 'En attente', 'A vérifier']) {
      expect(tacheOuverte(etat), etat).toBe(true);
    }
  });

  it('et pour closes celles qui le sont', () => {
    for (const etat of ['Terminer', 'Réalisé', 'realise', 'Clôturé', 'Abandonné']) {
      expect(tacheOuverte(etat), etat).toBe(false);
    }
  });

  // Une note écrite dans HERACLES n'a pas d'état : ce n'est pas une tâche.
  it('ne prend pas une note pour une tâche', () => {
    expect(tacheOuverte(null)).toBe(false);
    expect(tacheOuverte(undefined)).toBe(false);
    expect(tacheOuverte('   ')).toBe(false);
  });

  // `ETAT` est une liste de choix Bubble, rendue en texte libre : elle peut
  // gagner une valeur d'ici la bascule. Le mauvais côté de l'erreur n'est pas
  // le même des deux côtés — une tâche à faire qui s'affiche close se perd.
  it('tient pour ouvert un état qu’elle ne connaît pas', () => {
    expect(tacheOuverte('À relancer en septembre')).toBe(true);
  });
});

describe('resumeDuJournal', () => {
  it('le dit quand il n’y a rien', () => {
    expect(resumeDuJournal([])).toBe('rien de noté pour l’instant');
  });

  it('compte les notes, et s’arrête là si aucune tâche n’est ouverte', () => {
    expect(resumeDuJournal([ligne(null)])).toBe('1 note');
    expect(resumeDuJournal([ligne(null), ligne('Terminer')])).toBe('2 notes');
  });

  it('annonce les tâches qui restent à faire', () => {
    expect(resumeDuJournal([ligne('En cours'), ligne('Terminer')])).toBe(
      '2 notes · 1 tâche en cours',
    );
    expect(resumeDuJournal([ligne('En cours'), ligne('En attente')])).toBe(
      '2 notes · 2 tâches en cours',
    );
  });
});
