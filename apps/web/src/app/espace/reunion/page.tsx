import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Corbeille, Stylo } from '@/components/Icones';
import { dateEnLettres, initiales, nomAffichable } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import {
  ABSENT,
  EXCUSE,
  PRESENT,
  compter,
  lireFeuilleDAppel,
  lireRegistre,
  lireRegistreHorsExercice,
  lireUneReunion,
  phraseDeRefusReunion,
  rangerParPresences,
  type LigneDAppel,
  type LigneDeRegistre,
} from '@/lib/reunion';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Réunion — HERACLES' };

/**
 * « Réunion » — l'appel des référents, et le registre de l'exercice.
 *
 * L'écran a deux temps : le registre des réunions passées, et la feuille
 * d'appel de celle qu'on ouvre. L'adresse dit laquelle est ouverte — comme
 * partout ici, l'état de l'écran tient dans l'URL, donc un rafraîchissement
 * ne perd rien et une adresse se partage.
 *
 * Chaque clic enregistre. L'appel se fait à voix haute, nom par nom, et la
 * réponse doit être en base au moment où elle est donnée : une feuille qu'on
 * remplit puis qu'on soumet perd tout si le téléphone se verrouille au milieu.
 */
export default async function Reunion({
  searchParams,
}: {
  searchParams: Promise<{
    appel?: string | string[];
    retirer?: string | string[];
    erreur?: string | string[];
  }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

  const ouverte = premier(parametres.appel);
  const refus = phraseDeRefusReunion(premier(parametres.erreur));

  // La réunion ouverte se lit par son identifiant, et non dans le registre :
  // celui-ci ne rend que l'exercice en cours, et une réunion tenue hors bornes
  // ne s'affichait alors nulle part (migration 0037).
  const [registre, horsExercice, feuille, laReunion] = await Promise.all([
    lireRegistre(),
    lireRegistreHorsExercice(),
    ouverte ? lireFeuilleDAppel(ouverte) : Promise.resolve([]),
    ouverte ? lireUneReunion(ouverte) : Promise.resolve(null),
  ]);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  /** L'adresse de cette même page, avec un paramètre en plus ou en moins. */
  const adresse = (ajout?: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (ouverte) p.set('appel', ouverte);
    for (const [cle, valeur] of Object.entries(ajout ?? {})) {
      if (valeur === null) p.delete(cle);
      else p.set(cle, valeur);
    }
    const suite = p.toString();
    return suite ? `/espace/reunion?${suite}` : '/espace/reunion';
  };

  // La fenêtre de confirmation est rendue par le serveur, sur la seule foi de
  // l'adresse : elle s'ouvre sans une ligne de script, et le bouton « retour »
  // du navigateur la referme. Elle se cherche dans les deux registres, sans
  // quoi une réunion hors bornes s'afficherait avec une corbeille inerte.
  const aRetirer =
    [...registre, ...horsExercice].find((r) => r.id === premier(parametres.retirer)) ?? null;

  return (
    <main className="corps">
      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      <div className="entete-liste">
        <div>
          <h1>Réunion</h1>
          <span className="compte">
            {registre.length} réunion{registre.length > 1 ? 's' : ''} sur l’exercice
          </span>
        </div>
      </div>

      {ouverte && laReunion ? (
        <FeuilleDAppel reunion={laReunion} lignes={feuille} />
      ) : (
        <OuvrirUneReunion aujourdhui={aujourdhui} />
      )}

      <Registre lignes={registre} ouverte={ouverte} adresse={adresse} />
      <RegistrePasse lignes={horsExercice} ouverte={ouverte} adresse={adresse} />

      {aRetirer && (
        <FenetreDeRetrait reunion={aRetirer} fermer={adresse({ retirer: null })} />
      )}
    </main>
  );
}

/** Le bandeau qui ouvre la réunion du jour, ou d'un autre jour. */
function OuvrirUneReunion({ aujourdhui }: { aujourdhui: string }) {
  return (
    <section className="bloc reunion-ouvrir">
      <div>
        <h2>Faire l’appel</h2>
        <p className="maigre">
          La réunion du jour s’ouvre d’un clic. Si elle l’est déjà, vous retombez sur la
          même feuille — deux personnes ne tiennent jamais deux appels séparés.
        </p>
      </div>

      <form method="post" action="/api/reunions" className="reunion-ouvrir-form">
        <label className="visuellement-cache" htmlFor="tenue_le">
          Jour de la réunion
        </label>
        <input type="date" id="tenue_le" name="tenue_le" defaultValue={aujourdhui} />
        <input
          type="text"
          name="lieu"
          maxLength={200}
          placeholder="Lieu (facultatif)"
          aria-label="Lieu de la réunion"
        />
        <button className="bouton bouton--fort" type="submit">
          Ouvrir l’appel
        </button>
      </form>
    </section>
  );
}

/**
 * La feuille : une ligne par référent, la photo à gauche, trois boutons à
 * droite. C'est l'appel papier transposé — on descend la liste, on coche, et
 * personne ne se demande où il en est.
 */
function FeuilleDAppel({
  reunion,
  lignes,
}: {
  reunion: LigneDeRegistre;
  lignes: LigneDAppel[];
}) {
  const n = compter(lignes);
  const retour = `/espace/reunion?appel=${reunion.id}`;

  return (
    <section className="bloc appel">
      <div className="appel-tete">
        <div>
          <h2>
            Réunion du <time dateTime={reunion.tenue_le}>{dateEnLettres(reunion.tenue_le)}</time>
          </h2>
          <p className="maigre">
            {reunion.lieu ? `${reunion.lieu} · ` : ''}
            {lignes.length} référent{lignes.length > 1 ? 's' : ''}
          </p>

          {/* Une réunion hors des bornes de l'exercice s'appelle et se compte
              comme les autres, mais n'entre dans aucun total. Le taire
              donnerait des chiffres d'assiduité inexplicables. */}
          {reunion.hors_exercice && (
            <p className="aide">
              Cette réunion est hors de l’exercice en cours : elle ne compte dans aucun
              total, et n’apparaît pas au registre. Les dates d’exercice se règlent dans
              les paramètres de l’application.
            </p>
          )}
        </div>

        <div className="appel-compte">
          <span className="etat etat--suivi">{n.presents} présents</span>
          <span className="etat etat--attente">{n.excuses} excusés</span>
          <span className="etat etat--clos">{n.absents} absents</span>
          {n.aAppeler > 0 && <span className="maigre">{n.aAppeler} à appeler</span>}
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className="vide-liste">
          Aucun référent dans votre loge. Rattachez-les depuis l’annuaire avant de faire
          l’appel.
        </p>
      ) : (
        <ol className="appel-feuille">
          {lignes.map((ligne) => (
            <LigneDeFeuille
              key={ligne.referent_id}
              ligne={ligne}
              reunion={reunion.id}
              retour={retour}
            />
          ))}
        </ol>
      )}

      <p className="maigre" style={{ marginTop: '0.8rem' }}>
        Chaque clic est enregistré tout de suite. <Link href="/espace/reunion">Fermer la feuille</Link>
      </p>
    </section>
  );
}

/** Un référent : sa photo, son nom, son assiduité, et les trois boutons. */
function LigneDeFeuille({
  ligne,
  reunion,
  retour,
}: {
  ligne: LigneDAppel;
  reunion: string;
  retour: string;
}) {
  const nom = nomAffichable(ligne.prenom, ligne.nom, null) ?? 'Référent sans nom';

  // Ce qu'on a vu de cette personne depuis le début de l'exercice. C'est ce
  // chiffre qui donne son sens à l'appel : sans lui, on coche sans savoir.
  const assiduite = [
    ligne.presences > 0 && `${ligne.presences} présence${ligne.presences > 1 ? 's' : ''}`,
    ligne.excuses > 0 && `${ligne.excuses} excuse${ligne.excuses > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="appel-ligne" data-etat={ligne.etat ?? ''}>
      {/* La photo tout à gauche, avant le nom : on reconnaît un visage plus
          vite qu'on ne lit un patronyme, et l'appel se fait des gens devant
          soi. Les initiales prennent le relais quand Bubble n'a pas de photo. */}
      {ligne.a_une_photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="appel-portrait"
          src={`/espace/referents/${ligne.referent_id}/photo`}
          alt=""
          width={44}
          height={44}
        />
      ) : (
        <span className="appel-portrait appel-initiales" aria-hidden="true">
          {initiales(ligne.prenom, ligne.nom)}
        </span>
      )}

      <span className="appel-nom">
        {nom}
        <small>{assiduite || 'aucune présence cette année'}</small>
      </span>

      <span className="appel-segments" role="group" aria-label={`Appel de ${nom}`}>
        {[PRESENT, EXCUSE, ABSENT].map((etat) => (
          <form key={etat} method="post" action={`/api/reunions/${reunion}/appel`}>
            <input type="hidden" name="referent" value={ligne.referent_id} />
            <input type="hidden" name="etat" value={etat} />
            <input type="hidden" name="retour" value={retour} />
            <button
              type="submit"
              data-etat={etat}
              aria-pressed={ligne.etat === etat}
              aria-label={`${etat} — ${nom}`}
            >
              {etat}
            </button>
          </form>
        ))}
      </span>
    </li>
  );
}

/** L'adresse de la page, avec un paramètre en plus ou en moins. */
type Adresse = (ajout?: Record<string, string | null>) => string;

/**
 * Le registre de l'exercice, **rangé par nombre de présences**, de la mieux
 * suivie à la moins suivie.
 *
 * C'est un classement, pas une chronologie : la question qu'on pose à ce
 * tableau est « quelles réunions ont réuni du monde », et la date reste lisible
 * sur chaque ligne. À égalité de présences, la plus récente passe devant — sans
 * quoi l'ordre dépendrait de celui que la base a rendu, et deux affichages
 * successifs ne se ressembleraient pas.
 */
function Registre({
  lignes,
  ouverte,
  adresse,
}: {
  lignes: LigneDeRegistre[];
  ouverte: string;
  adresse: Adresse;
}) {
  if (lignes.length === 0) {
    return (
      <p className="vide-liste">
        Aucune réunion sur cet exercice. La première ouvre le registre.
      </p>
    );
  }

  return (
    <section className="bloc" style={{ marginTop: '1rem' }}>
      <h2>Le registre de l’exercice</h2>
      <p className="maigre">
        De la réunion la plus suivie à la moins suivie. Les dates d’exercice viennent des
        paramètres de l’application ; une réunion hors de ces bornes ne compte pas.
      </p>

      <TableauDuRegistre lignes={rangerParPresences(lignes)} ouverte={ouverte} adresse={adresse} />
    </section>
  );
}

/**
 * « Le registre de l'exercice passé » — tout ce qui tombe hors des bornes.
 *
 * Des deux côtés, et c'est voulu : les réunions des exercices précédents, mais
 * aussi celles tenues **depuis la clôture**. Ce second cas est le plus gênant,
 * parce qu'il grandit tous les jours tant que les dates d'exercice n'ont pas
 * été remises à jour, et que ces réunions n'apparaissaient jusqu'ici nulle
 * part. Ici, elles portent la mention « après la clôture ».
 *
 * Ordre chronologique, la plus récente d'abord : sur un registre d'archives on
 * cherche une date, pas un classement.
 */
function RegistrePasse({
  lignes,
  ouverte,
  adresse,
}: {
  lignes: LigneDeRegistre[];
  ouverte: string;
  adresse: Adresse;
}) {
  if (lignes.length === 0) return null;

  const depuisLaCloture = lignes.filter((r) => r.avant === false).length;

  return (
    <section className="bloc" style={{ marginTop: '1rem' }}>
      <h2>Le registre de l’exercice passé</h2>
      <p className="maigre">
        Les réunions qui tombent hors des bornes de l’exercice en cours. Elles se
        consultent et se corrigent comme les autres, mais n’entrent dans aucun total
        d’assiduité.
      </p>

      {depuisLaCloture > 0 && (
        <p className="aide">
          {depuisLaCloture === 1
            ? 'Une réunion a été tenue après la clôture de l’exercice.'
            : `${depuisLaCloture} réunions ont été tenues après la clôture de l’exercice.`}{' '}
          Elles ne comptent pour personne tant que les dates d’exercice n’ont pas été
          reportées dans les paramètres de l’application.
        </p>
      )}

      <TableauDuRegistre lignes={lignes} ouverte={ouverte} adresse={adresse} periode />
    </section>
  );
}

/** Le tableau, commun aux deux registres : mêmes colonnes, mêmes gestes. */
function TableauDuRegistre({
  lignes,
  ouverte,
  adresse,
  periode = false,
}: {
  lignes: LigneDeRegistre[];
  ouverte: string;
  adresse: Adresse;
  /** Dire de quel côté des bornes chaque réunion tombe. */
  periode?: boolean;
}) {
  return (
    <div className="table-large">
      <table className="registre">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" className="n">Présents</th>
            <th scope="col" className="n">Excusés</th>
            <th scope="col" className="n">Absents</th>
            <th scope="col">
              <span className="visuellement-cache">Gestes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((r) => (
            <tr key={r.id} aria-current={r.id === ouverte ? 'true' : undefined}>
              <td>
                <Link href={`/espace/reunion?appel=${r.id}`}>
                  <time dateTime={r.tenue_le}>{dateEnLettres(r.tenue_le)}</time>
                </Link>
                {r.lieu && <small className="maigre"> · {r.lieu}</small>}
                {periode && (
                  <small className="maigre">
                    {' '}
                    · {r.avant ? 'exercice précédent' : 'après la clôture'}
                  </small>
                )}
              </td>
              <td className="n">{r.presents}</td>
              <td className="n">{r.excuses}</td>
              <td className="n">{r.absents}</td>
              <td>
                <span className="gestes">
                  <Link
                    href={`/espace/reunion?appel=${r.id}`}
                    className="geste geste--corriger"
                    aria-label={`Reprendre l’appel du ${dateEnLettres(r.tenue_le)}`}
                    title="Reprendre l’appel"
                  >
                    <Stylo />
                  </Link>
                  {/* La corbeille n'efface pas : elle ouvre la fenêtre de
                      confirmation, qui dit ce qu'on perd avant de le perdre. */}
                  <Link
                    href={adresse({ retirer: r.id })}
                    className="geste geste--retirer"
                    aria-label={`Retirer la réunion du ${dateEnLettres(r.tenue_le)}`}
                    title="Retirer cette réunion"
                  >
                    <Corbeille />
                  </Link>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La fenêtre de confirmation avant de retirer une réunion.
 *
 * Elle dit **ce qu'on perd**, chiffres à l'appui, plutôt que « êtes-vous
 * sûr ? » — une question à laquelle on répond oui sans lire. Elle se referme
 * de trois façons : « Annuler », un clic à côté, et le bouton « retour » du
 * navigateur, puisque son ouverture n'est qu'une adresse.
 */
function FenetreDeRetrait({
  reunion,
  fermer,
}: {
  reunion: LigneDeRegistre;
  fermer: string;
}) {
  const pointes = reunion.presents + reunion.excuses;

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien retirer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retrait-reunion">
        <h2 id="retrait-reunion">
          Retirer la réunion du {dateEnLettres(reunion.tenue_le)}&nbsp;?
        </h2>

        <p>
          {pointes === 0 ? (
            <>Personne n’a encore été appelé à cette réunion.</>
          ) : (
            <>
              <strong>
                {reunion.presents} présence{reunion.presents > 1 ? 's' : ''} et{' '}
                {reunion.excuses} excuse{reunion.excuses > 1 ? 's' : ''}
              </strong>{' '}
              quitteront les compteurs de l’exercice, et cette réunion n’apparaîtra plus au
              registre.
            </>
          )}
        </p>

        {/* Ce que le mot « retirer » veut dire ici, écrit en toutes lettres :
            promettre une suppression qui n'en est pas serait pire que de ne
            rien dire. */}
        <p className="aide">
          Retirer n’est pas effacer. L’appel reste en base, et la page{' '}
          <Link href={`/espace/reunion/${reunion.id}/retirer`}>de cette réunion</Link> permettra
          de la rendre au registre.
        </p>

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/reunions/${reunion.id}/retirer`}>
            <input type="hidden" name="geste" value="retirer" />
            <input type="hidden" name="retour" value="/espace/reunion" />
            <button className="bouton bouton--danger" type="submit">
              Retirer du registre
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
