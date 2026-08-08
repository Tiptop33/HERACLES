import Link from 'next/link';
import { redirect } from 'next/navigation';
import LigneDeSuivi from '@/components/LigneDeSuivi';
import {
  A_FAIRE,
  apercuDuDossier,
  jeSuisReferent,
  lireJournalDeLaLoge,
  parCandidat,
  phraseDeRefus,
  tacheOuverte,
  type LigneDeLaLoge,
} from '@/lib/journal';
import { listerCandidatsDeLaLoge, nomDeFamilleDabord, type LigneCandidat } from '@/lib/poste';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import { estFerme } from '@/lib/suivi';

export const metadata = { title: 'Action / Candidat — HERACLES' };

/** Ce que l'écran peut montrer. */
const VUES = [
  { valeur: 'mes', libelle: 'Mes candidats' },
  { valeur: 'loge', libelle: 'La loge' },
] as const;

type Vue = (typeof VUES)[number]['valeur'];

function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/**
 * « Action / Candidat » — le suivi de toute la loge, d'un seul tenant.
 *
 * Le poste de travail montre le journal d'une personne à la fois : il faut
 * ouvrir cent sept fiches pour savoir ce qui a bougé. Cet écran-ci les met
 * bout à bout, un candidat après l'autre — et surtout, il montre **ceux sur
 * qui rien n'a été noté**, que par définition on ne va jamais voir.
 *
 * Les dossiers refermés n'y sont pas : on ne relance pas un dossier clos.
 */
export default async function ActionCandidat({
  searchParams,
}: {
  searchParams: Promise<{
    vue?: string | string[];
    /** La note ouverte en correction. */
    note?: string | string[];
    erreur?: string | string[];
  }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const demandee = premier(parametres.vue);
  const refus = phraseDeRefus(premier(parametres.erreur));
  const corrige = premier(parametres.note) || null;

  const [candidats, notes, jePeuxNoter] = await Promise.all([
    listerCandidatsDeLaLoge(),
    lireJournalDeLaLoge(),
    jeSuisReferent(),
  ]);

  // Comme le poste de travail : on ouvre sur les siens, sauf si l'on n'en
  // accompagne aucun.
  const ouverture: Vue = candidats.some((c) => c.c_est_mon_suivi && !estFerme(c))
    ? 'mes'
    : 'loge';
  const vue: Vue = VUES.some((v) => v.valeur === demandee) ? (demandee as Vue) : ouverture;

  const enCours = candidats.filter((c) => !estFerme(c));
  const retenus = vue === 'mes' ? enCours.filter((c) => c.c_est_mon_suivi) : enCours;

  const journal = parCandidat(notes);

  // L'ordre : ceux qu'on a touchés le plus récemment d'abord, puis ceux dont
  // le journal est vide. C'est l'inverse d'un classement par numéro, et c'est
  // voulu — la question posée ici n'est pas « qui ? » mais « quoi de neuf ? ».
  const ranges = [...retenus].sort((a, b) => {
    const da = journal.get(a.id)?.[0]?.fait_le ?? '';
    const db = journal.get(b.id)?.[0]?.fait_le ?? '';
    if (da === db) return (a.numero ?? 0) - (b.numero ?? 0);
    return db.localeCompare(da);
  });

  const sansNote = ranges.filter((c) => !journal.has(c.id)).length;

  // Les tâches restées ouvertes dans Bubble (migration 0023). Sur cet écran-ci
  // c'est le chiffre qui compte : ce n'est pas ce qui a été fait, c'est ce qui
  // reste à faire.
  const aFaire = ranges.reduce(
    (compte, c) => compte + (journal.get(c.id)?.filter((n) => tacheOuverte(n.etat)).length ?? 0),
    0,
  );

  const adresse = (v: Vue) =>
    v === ouverture ? '/espace/suivi' : `/espace/suivi?vue=${v}`;

  return (
    <main className="corps">
      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      <div className="entete-liste">
        <div>
          <h1>Action / Candidat</h1>
          <span className="compte">
            {ranges.length} dossier{ranges.length > 1 ? 's' : ''} en cours
            {aFaire > 0 && ` · ${aFaire} tâche${aFaire > 1 ? 's' : ''} à faire`}
            {sansNote > 0 && ` · ${sansNote} sans aucune note`}
          </span>
        </div>

        <div className="filtres">
          {VUES.map(({ valeur, libelle }) => (
            <Link
              key={valeur}
              href={adresse(valeur)}
              className="filtre"
              aria-current={vue === valeur}
            >
              {libelle}
            </Link>
          ))}
        </div>
      </div>

      {ranges.length === 0 ? (
        <p className="vide-liste">
          {vue === 'mes'
            ? 'Vous n’accompagnez aucun candidat. « La loge » montre ceux de vos collègues.'
            : 'Aucun dossier en cours dans vos loges.'}
        </p>
      ) : (
        <div className="suivi-loge">
          {ranges.map((candidat) => (
            <Dossier
              key={candidat.id}
              candidat={candidat}
              notes={journal.get(candidat.id) ?? []}
              retour={adresse(vue)}
              corrige={corrige}
              jePeuxNoter={jePeuxNoter}
            />
          ))}
        </div>
      )}
    </main>
  );
}

/** Un candidat et son journal, ou le silence qui en tient lieu. */
function Dossier({
  candidat,
  notes,
  retour,
  corrige,
  jePeuxNoter,
}: {
  candidat: LigneCandidat;
  notes: LigneDeLaLoge[];
  /** Cet écran, vue comprise : on note sans le quitter. */
  retour: string;
  /** La note ouverte en correction, s'il y en a une sur cet écran. */
  corrige: string | null;
  /** Le compte a-t-il une fiche de référent ? C'est tout ce qu'écrire demande. */
  jePeuxNoter: boolean;
}) {
  const nom = nomDeFamilleDabord(candidat.nom, candidat.prenom);
  const sous = [candidat.metier, candidat.referent_nom && `suivi par ${candidat.referent_nom}`]
    .filter(Boolean)
    .join(' · ');

  // Cet écran répond à « quoi de neuf ? ». Le journal entier, lui, se lit dans
  // la fiche : c'est l'espace du candidat, et il n'a pas de raison d'être
  // recopié ici. Les dossiers repris de Bubble en portent jusqu'à vingt-cinq.
  const { visibles, reste, resteOuvert } = apercuDuDossier(notes);
  const saFiche = `/espace/candidats?fiche=${candidat.id}&onglet=suivi`;

  return (
    <section className="bloc suivi-dossier">
      <div className="suivi-dossier-tete">
        <div>
          <h2 className="suivi-dossier-nom">
            <Link href={saFiche}>{nom}</Link>
          </h2>
          <p className="maigre">{sous || 'métier non renseigné'}</p>
        </div>
        {candidat.numero !== null && (
          <span className="poste-rang-numero">
            <span className="visuellement-cache">Fiche n° </span>
            {candidat.numero}
          </span>
        )}
      </div>

      {/* Noter sans ouvrir la fiche. C'est ce qui fait de cet écran un poste de
          travail plutôt qu'un tableau : on descend la liste des dossiers en
          cours et on consigne au fil de l'eau.

          Sur tous les dossiers, y compris ceux des collègues (0027) : celui qui
          prend l'appel est rarement celui qui accompagne, et une note qu'on ne
          peut pas écrire n'est écrite nulle part. */}
      {jePeuxNoter && (
        <form
          className="suivi-noter"
          method="post"
          action={`/api/candidats/${candidat.id}/suivi`}
        >
          <input type="hidden" name="retour" value={retour} />
          <textarea
            name="texte"
            required
            maxLength={4000}
            rows={2}
            placeholder="Ce qui s’est passé, ou ce qui reste à faire…"
            aria-label={`Ajouter un commentaire pour ${nom}`}
          />
          <div className="suivi-noter-pied">
            <button className="bouton bouton--fort" type="submit">
              Ajouter
            </button>
            <button className="bouton" type="submit" name="etat" value={A_FAIRE}>
              À faire
            </button>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        /* Le cas qui justifie l'écran : sans lui, un dossier dont personne
           n'a rien noté ne se signale nulle part. */
        <p className="suivi-silence">
          Rien de noté. <Link href={saFiche}>Ouvrir son journal</Link>
        </p>
      ) : (
        <ol className="journal-lignes">
          {visibles.map((note) => (
            <LigneDeSuivi
              key={note.id}
              ligne={note}
              retour={retour}
              enCorrection={note.id === corrige}
              versCorrection={`${retour}${retour.includes('?') ? '&' : '?'}note=${note.id}`}
              versLecture={retour}
            />
          ))}
        </ol>
      )}

      {/* Ce qui reste se lit dans la fiche. On dit combien de tâches y sont
          encore ouvertes : le journal se lit du plus récent au plus ancien, et
          rien ne garantit qu'une tâche en cours soit récente — la replier sans
          le dire reviendrait à la perdre. */}
      {reste > 0 && (
        <p className="suivi-silence">
          <Link href={saFiche}>
            Voir les {reste} autres notes
            {resteOuvert > 0 &&
              `, dont ${resteOuvert} tâche${resteOuvert > 1 ? 's' : ''} en cours`}
          </Link>
        </p>
      )}
    </section>
  );
}
