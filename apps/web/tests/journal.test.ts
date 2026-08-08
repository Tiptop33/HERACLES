import { describe, expect, it } from 'vitest';
import {
  APERCU,
  apercuDuDossier,
  phraseDeRefus,
  resumeDuJournal,
  tacheOuverte,
  type LigneDeJournal,
} from '../src/lib/journal';

/** Une ligne de journal, réduite à ce que les fonctions regardent. */
function ligne(etat: string | null): LigneDeJournal {
  return {
    id: crypto.randomUUID(),
    fait_le: '2026-03-15',
    nature: null,
    etat,
    texte: 'Relance de l’entreprise.',
    auteur_nom: 'P Paul',
    etat_par_nom: null,
    je_peux_agir: true,
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

describe('apercuDuDossier', () => {
  it('montre tout quand le dossier tient dans l’aperçu', () => {
    const notes = [ligne('En cours'), ligne(null)];
    expect(apercuDuDossier(notes)).toEqual({ visibles: notes, reste: 0, resteOuvert: 0 });
  });

  it('coupe au-delà, et compte ce qui suit', () => {
    const notes = Array.from({ length: 25 }, () => ligne(null));
    const vu = apercuDuDossier(notes);

    expect(vu.visibles).toHaveLength(APERCU);
    expect(vu.reste).toBe(25 - APERCU);
    // Le début du tableau, et non un échantillon : le journal arrive trié du
    // plus récent au plus ancien, et c'est le récent qu'on montre.
    expect(vu.visibles[0]).toBe(notes[0]);
  });

  // Le cas qui justifie `resteOuvert` : une tâche en cours peut être ancienne,
  // donc repliée. La taire ferait disparaître du travail à faire.
  it('signale les tâches en cours qu’il replie', () => {
    const notes = [
      ...Array.from({ length: APERCU }, () => ligne('Terminer')),
      ligne('En cours'),
      ligne('En attente'),
      ligne('Terminer'),
    ];
    const vu = apercuDuDossier(notes);

    expect(vu.reste).toBe(3);
    expect(vu.resteOuvert).toBe(2);
  });

  it('ne compte pas les notes sans état comme des tâches en cours', () => {
    const notes = Array.from({ length: APERCU + 4 }, () => ligne(null));
    expect(apercuDuDossier(notes).resteOuvert).toBe(0);
  });
});

describe('phraseDeRefus', () => {
  it('ne dit rien quand rien n’a été refusé', () => {
    expect(phraseDeRefus(null)).toBeNull();
    expect(phraseDeRefus(undefined)).toBeNull();
    expect(phraseDeRefus('')).toBeNull();
  });

  it('traduit les codes que les routes renvoient', () => {
    expect(phraseDeRefus('droit')).toContain('référent et le parrain');
    expect(phraseDeRefus('sans-fiche')).toContain('fiche de référent');
  });

  // Le code vient de l'adresse, donc de n'importe qui : un code inventé ne
  // doit pas afficher une phrase inventée, ni une page blanche.
  it('retombe sur une phrase neutre pour un code inconnu', () => {
    expect(phraseDeRefus('<script>')).toBe('La note n’a pas pu être enregistrée.');
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
