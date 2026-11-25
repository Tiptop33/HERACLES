'use client';

import { useState } from 'react';
import {
  ACCEPTE_DOCUMENT,
  DOCUMENTS_PAR_GENRE,
  GENRES_DE_DOCUMENT,
  TAILLE_MAXIMALE_DU_DOCUMENT,
  jourCourt,
  taillePourLire,
  validerUnNom,
  type DocumentDuCandidat,
  type GenreDeDocument,
} from '@/lib/page-candidat';

/**
 * « Mes documents » (0105) : jusqu'à cinq CV et cinq lettres, un principal de
 * chaque. Supprimer demande une confirmation, sur place : le fichier part pour
 * de bon.
 */
export default function DocumentsDuCandidat({ initiaux }: { initiaux: DocumentDuCandidat[] }) {
  const [documents, setDocuments] = useState(initiaux);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<GenreDeDocument | null>(null);
  const [avis, setAvis] = useState<Partial<Record<GenreDeDocument | string, { texte: string; erreur?: boolean }>>>({});

  const dire = (cle: string, texte: string | null, erreur = false) =>
    setAvis((a) => {
      const suite = { ...a };
      if (texte) suite[cle] = { texte, erreur };
      else delete suite[cle];
      return suite;
    });

  async function deposer(genre: GenreDeDocument, fichier: File) {
    if (fichier.size > TAILLE_MAXIMALE_DU_DOCUMENT) return dire(genre, 'Ce fichier dépasse 10 Mo.', true);
    setEnvoi(genre);
    dire(genre, null);
    try {
      const donnees = new FormData();
      donnees.set('genre', genre);
      donnees.set('fichier', fichier);
      const reponse = await fetch('/api/espace-candidat/documents', { method: 'POST', body: donnees });
      const lu = (await reponse.json().catch(() => null)) as { document?: DocumentDuCandidat; erreur?: string } | null;
      if (!reponse.ok || !lu?.document) return dire(genre, lu?.erreur ?? 'Le dépôt a échoué. Réessayez.', true);
      const nouveau = lu.document;
      setDocuments((d) => [...d, nouveau]);
      dire(genre, `« ${nouveau.nom} » est déposé. Donnez-lui un nom parlant pour vous y retrouver.`);
    } catch {
      dire(genre, 'Le serveur ne répond pas. Le fichier n’est pas déposé.', true);
    } finally {
      setEnvoi(null);
    }
  }

  async function renommer(doc: DocumentDuCandidat, brut: string) {
    const verdict = validerUnNom(brut);
    if (!verdict.ok) return dire(doc.id, verdict.message, true);
    if (verdict.valeur === doc.nom) return dire(doc.id, null);
    const reponse = await fetch(`/api/espace-candidat/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: verdict.valeur }),
    }).catch(() => null);
    if (!reponse?.ok) return dire(doc.id, 'Le nom n’a pas pu être enregistré. Réessayez.', true);
    setDocuments((d) => d.map((x) => (x.id === doc.id ? { ...x, nom: verdict.valeur } : x)));
    dire(doc.id, 'Enregistré');
  }

  async function choisirPrincipal(doc: DocumentDuCandidat) {
    const reponse = await fetch(`/api/espace-candidat/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal: true }),
    }).catch(() => null);
    if (!reponse?.ok) return dire(doc.genre, 'Le changement n’a pas pu être enregistré. Réessayez.', true);
    setDocuments((d) => d.map((x) => (x.genre === doc.genre ? { ...x, principal: x.id === doc.id } : x)));
    dire(doc.genre, `« ${doc.nom} » est désormais votre document principal.`);
  }

  async function supprimer(doc: DocumentDuCandidat) {
    const reponse = await fetch(`/api/espace-candidat/documents/${doc.id}`, { method: 'DELETE' }).catch(() => null);
    setAConfirmer(null);
    if (!reponse?.ok) return dire(doc.genre, 'La suppression a échoué. Réessayez.', true);

    let texte = `« ${doc.nom} » est supprimé.`;
    setDocuments((d) => {
      const reste = d.filter((x) => x.id !== doc.id);
      if (!doc.principal) return reste;
      // La même règle que la base : le plus récent prend la place.
      const memes = reste.filter((x) => x.genre === doc.genre).sort((a, b) => b.depose_le.localeCompare(a.depose_le));
      if (memes[0]) texte += ` « ${memes[0].nom} » devient votre document principal.`;
      return reste.map((x) => (memes[0] && x.id === memes[0].id ? { ...x, principal: true } : x));
    });
    dire(doc.genre, texte);
  }

  return (
    <section className="pc-bloc" id="pc-documents" aria-labelledby="pc-documents-titre">
      <header>
        <h2 id="pc-documents-titre">Mes documents</h2>
      </header>
      <p className="pc-aide">
        Le document principal est celui que votre référent ouvre en premier. Il voit aussi tous les autres.
      </p>

      <div className="pc-docs">
        {GENRES_DE_DOCUMENT.map(({ valeur: genre, titre, un }) => {
          const liste = documents
            .filter((d) => d.genre === genre)
            .sort((a, b) => Number(b.principal) - Number(a.principal) || b.depose_le.localeCompare(a.depose_le));
          const plein = liste.length >= DOCUMENTS_PAR_GENRE;
          return (
            <div key={genre}>
              <h3>
                {titre} <span className="pc-compteur">{liste.length} sur {DOCUMENTS_PAR_GENRE}</span>
              </h3>
              <ul className="pc-liste-docs">
                {liste.map((d) => (
                  <li key={d.id} className={`pc-doc${d.principal ? ' pc-doc--principal' : ''}`}>
                    <span className="pc-format" aria-hidden="true">
                      {d.format}
                    </span>
                    <input
                      className="pc-doc-nom"
                      defaultValue={d.nom}
                      maxLength={80}
                      aria-label={`Nom du document ${d.nom}`}
                      onBlur={(e) => void renommer(d, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <span className="pc-doc-coin">{d.principal && <span className="pc-etiquette pc-etiquette--marque">Principal</span>}</span>
                    <span className="pc-doc-meta">
                      Déposé le {jourCourt(d.depose_le)}
                      {taillePourLire(d.taille) ? ` · ${taillePourLire(d.taille)}` : ''}
                    </span>
                    <span className="pc-doc-gestes">
                      <a className="pc-lien" href={`/api/espace-candidat/documents/${d.id}`}>
                        Ouvrir
                      </a>
                      {!d.principal && (
                        <button type="button" className="pc-lien" onClick={() => void choisirPrincipal(d)}>
                          En faire le principal
                        </button>
                      )}
                      <button type="button" className="pc-lien pc-lien--alerte" onClick={() => setAConfirmer(d.id)}>
                        Supprimer
                      </button>
                    </span>
                    {avis[d.id] && (
                      <p className={avis[d.id]?.erreur ? 'pc-erreur pc-doc-avis' : 'pc-avis pc-doc-avis'} role="status">
                        {avis[d.id]?.texte}
                      </p>
                    )}
                    {aConfirmer === d.id && (
                      <div className="pc-confirmer" role="group" aria-label="Confirmer la suppression">
                        <span>Supprimer « {d.nom} » pour de bon&nbsp;? Il ne pourra pas être récupéré.</span>
                        <button type="button" className="bouton pc-bouton-alerte" onClick={() => void supprimer(d)}>
                          Supprimer
                        </button>
                        <button type="button" className="bouton" onClick={() => setAConfirmer(null)}>
                          Garder
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {plein ? (
                <p className="pc-depot pc-depot--plein">Cinq au plus : supprimez-en un pour ajouter {un}.</p>
              ) : (
                <label className="pc-depot">
                  <span>
                    {envoi === genre ? 'Envoi…' : `Ajouter ${un}`}
                    <small>PDF, Word, OpenDocument, RTF ou image · 10 Mo au plus</small>
                  </span>
                  <input
                    type="file"
                    className="visuellement-cache"
                    accept={ACCEPTE_DOCUMENT}
                    disabled={envoi !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void deposer(genre, f);
                    }}
                  />
                </label>
              )}
              {avis[genre] && (
                <p className={avis[genre]?.erreur ? 'pc-erreur' : 'pc-avis'} role="status">
                  {avis[genre]?.texte}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
