import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dateEnLettres } from '@/lib/format';
import { lireJournalDeLaLoge, parCandidat, type LigneDeLaLoge } from '@/lib/journal';
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
  searchParams: Promise<{ vue?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const demandee = premier((await searchParams).vue);

  const [candidats, notes] = await Promise.all([
    listerCandidatsDeLaLoge(),
    lireJournalDeLaLoge(),
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

  const adresse = (v: Vue) =>
    v === ouverture ? '/espace/suivi' : `/espace/suivi?vue=${v}`;

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Action / Candidat</h1>
          <span className="compte">
            {ranges.length} dossier{ranges.length > 1 ? 's' : ''} en cours
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
            />
          ))}
        </div>
      )}
    </main>
  );
}

/** Un candidat et son journal, ou le silence qui en tient lieu. */
function Dossier({ candidat, notes }: { candidat: LigneCandidat; notes: LigneDeLaLoge[] }) {
  const nom = nomDeFamilleDabord(candidat.nom, candidat.prenom);
  const sous = [candidat.metier, candidat.referent_nom && `suivi par ${candidat.referent_nom}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="bloc suivi-dossier">
      <div className="suivi-dossier-tete">
        <div>
          <h2 className="suivi-dossier-nom">
            <Link href={`/espace/candidats?fiche=${candidat.id}&onglet=suivi`}>{nom}</Link>
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

      {notes.length === 0 ? (
        /* Le cas qui justifie l'écran : sans lui, un dossier dont personne
           n'a rien noté ne se signale nulle part. */
        <p className="suivi-silence">
          Rien de noté. <Link href={`/espace/candidats?fiche=${candidat.id}&onglet=suivi`}>Ouvrir son journal</Link>
        </p>
      ) : (
        <ol className="journal-lignes">
          {notes.map((note) => (
            <li key={note.id} className="journal-ligne">
              <div className="journal-ligne-tete">
                <time dateTime={note.fait_le}>{dateEnLettres(note.fait_le)}</time>
                {note.nature && <span className="etiquette">{note.nature}</span>}
                <span className="journal-auteur">
                  {note.c_est_moi ? 'vous' : (note.auteur_nom ?? 'auteur inconnu')}
                </span>
              </div>
              <p className="prose">{note.texte}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
