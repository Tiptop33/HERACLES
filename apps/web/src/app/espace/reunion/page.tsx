import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Corbeille, Croix, FlecheRetour, Stylo } from '@/components/Icones';
import { dateEnLettres, initiales, nomAffichable } from '@/lib/format';
import { lireLesConnectes } from '@/lib/presence';
import { exigerProfil } from '@/lib/profil';
import {
  ABSENT,
  EXCUSE,
  PRESENT,
  compter,
  lireFeuilleDAppel,
  lireRegistre,
  lireRegistreDesRetirees,
  lireRegistreHorsExercice,
  lireUneReunion,
  phraseDeRefusReunion,
  puisJeEffacerDesReunions,
  rangerParDate,
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
    rendre?: string | string[];
    effacer?: string | string[];
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
  const [registre, retirees, horsExercice, feuille, laReunion, peutEffacer, connectes] =
    await Promise.all([
      lireRegistre(),
      lireRegistreDesRetirees(),
      lireRegistreHorsExercice(),
      ouverte ? lireFeuilleDAppel(ouverte) : Promise.resolve([]),
      ouverte ? lireUneReunion(ouverte) : Promise.resolve(null),
      puisJeEffacerDesReunions(),
      ouverte ? lireLesConnectes() : Promise.resolve([]),
    ]);

  // Ceux dont la session est ouverte. Depuis 0053, ouvrir l'appel les a déjà
  // marqués présents : la plupart portent donc un état en base, et leur ligne
  // n'a plus rien de provisoire. La pastille verte du portrait dit qu'ils sont
  // connectés — c'est la connexion qu'elle montre, pas le pointage.
  //
  // Restent les retardataires, connectés après l'ouverture : eux n'ont rien en
  // base, et gardent le bouton « Présent » en pointillé le temps qu'on les
  // coche — voir `LigneDeFeuille`.
  const enLigne = new Set(connectes.map((c) => c.referent_id));
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

  // Son symétrique : rendre une réunion retirée. Elle ne se cherche que dans
  // les retirées — on ne rend pas ce qui n'a pas été retiré.
  const aRendre = retirees.find((r) => r.id === premier(parametres.rendre)) ?? null;

  // Effacer ne se cherche que dans le registre de l'exercice : c'est le seul
  // cadre qui porte le geste.
  const aEffacer = peutEffacer
    ? (registre.find((r) => r.id === premier(parametres.effacer) && !r.venue_de_bubble) ?? null)
    : null;

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
        <FeuilleDAppel reunion={laReunion} lignes={feuille} connectes={enLigne} />
      ) : (
        <OuvrirUneReunion aujourdhui={aujourdhui} />
      )}

      <Registre
        lignes={registre}
        ouverte={ouverte}
        adresse={adresse}
        peutEffacer={peutEffacer}
      />
      <Retirees lignes={retirees} adresse={adresse} />
      <RegistrePasse lignes={horsExercice} ouverte={ouverte} adresse={adresse} />

      {aRetirer && (
        <FenetreDeRetrait reunion={aRetirer} fermer={adresse({ retirer: null })} />
      )}
      {aRendre && <FenetreDeRetour reunion={aRendre} fermer={adresse({ rendre: null })} />}
      {aEffacer && (
        <FenetreDEffacement reunion={aEffacer} fermer={adresse({ effacer: null })} />
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
  connectes,
}: {
  reunion: LigneDeRegistre;
  lignes: LigneDAppel[];
  /** Ceux dont la session est ouverte : « Présent » leur est proposé. */
  connectes: Set<string>;
}) {
  const n = compter(lignes);
  const retour = `/espace/reunion?appel=${reunion.id}`;

  // Ceux que le bouton de groupe marquerait : en ligne, et pas encore appelés.
  // Les compter ici plutôt que côté base évite de proposer un geste qui ne
  // ferait rien — quand tous les présents sont déjà cochés, le bouton n'a plus
  // lieu d'être et disparaît.
  const aCocher = lignes.filter((l) => connectes.has(l.referent_id) && l.etat === null).length;

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

          {/* Le raccourci : cocher d'un coup ceux dont la feuille propose déjà
              le bouton « Présent » en pointillé. L'écran le savait, il ne
              faisait rien de ce savoir.

              Rien à confirmer : ce geste ne pose que des états qu'on aurait
              posés à la main, il n'écrase aucune réponse déjà donnée, et
              chaque ligne se corrige d'un clic. Il disparaît quand il n'y a
              plus personne à cocher. */}
          {aCocher > 0 && (
            <form method="post" action={`/api/reunions/${reunion.id}/presents`}>
              <input type="hidden" name="retour" value={retour} />
              <button type="submit" className="bouton bouton--fort appel-tous">
                Présents : les {aCocher} en ligne
              </button>
            </form>
          )}
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
              enLigne={connectes.has(ligne.referent_id)}
            />
          ))}
        </ol>
      )}

      {/* Fermer la feuille n'est pas un simple retour : c'est la fin de
          l'appel. Ceux que personne n'a nommés sont marqués absents à cet
          instant (migration 0039) — dans une feuille d'appel, celui qu'on n'a
          pas appelé n'était pas là, et laisser la case vide perdrait
          l'information au moment même où elle est complète. Un état déjà posé
          n'est jamais touché, et rouvrir la feuille permet de corriger. */}
      <form method="post" action={`/api/reunions/${reunion.id}/clore`} className="appel-clore">
        <input type="hidden" name="retour" value="/espace/reunion" />
        <p className="maigre">
          Chaque clic est enregistré tout de suite.{' '}
          {n.aAppeler > 0 && (
            <>
              À la fermeture, {n.aAppeler === 1 ? 'le référent' : `les ${n.aAppeler} référents`}{' '}
              que l’appel n’a pas {n.aAppeler === 1 ? 'nommé' : 'nommés'} ser
              {n.aAppeler === 1 ? 'a noté absent' : 'ont notés absents'}.
            </>
          )}
        </p>
        <button className="bouton" type="submit">
          Fermer la feuille
        </button>
      </form>
    </section>
  );
}

/** Un référent : sa photo, son nom, son assiduité, et les trois boutons. */
function LigneDeFeuille({
  ligne,
  reunion,
  retour,
  enLigne = false,
}: {
  ligne: LigneDAppel;
  reunion: string;
  retour: string;
  /** Sa session est ouverte : « Présent » lui est proposé, sans être posé. */
  enLigne?: boolean;
}) {
  const nom = nomAffichable(ligne.prenom, ligne.nom, null) ?? 'Référent sans nom';

  /**
   * Le bouton proposé à celui qui est en ligne, tant que personne ne l'a
   * appelé. Rien n'est en base : l'en-tête ne le compte pas, et il faut
   * cliquer pour l'enregistrer — le pointillé du bouton dit cette différence,
   * sans quoi la feuille aurait l'air remplie alors qu'elle ne l'est pas.
   */
  const propose = enLigne && ligne.etat === null ? PRESENT : null;

  // Ce que porte cette personne **sur cette réunion**, et rien d'autre : le
  // cumul de l'exercice a été retiré en 0045. Le chiffre vaut donc zéro ou un,
  // et double ce que disent déjà les trois boutons — c'est le choix qui a été
  // fait, et il se défait par une migration qui remet les bornes de 0036.
  const assiduite = [
    ligne.presences > 0 && `${ligne.presences} présence${ligne.presences > 1 ? 's' : ''}`,
    ligne.excuses > 0 && `${ligne.excuses} excuse${ligne.excuses > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="appel-ligne" data-etat={ligne.etat ?? ''} data-en-ligne={enLigne || undefined}>
      {/* La photo tout à gauche, avant le nom : on reconnaît un visage plus
          vite qu'on ne lit un patronyme, et l'appel se fait des gens devant
          soi. Les initiales prennent le relais quand Bubble n'a pas de photo. */}
      <span className="appel-visage">
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

        {/* La pastille : « sa session est ouverte, en ce moment ». Depuis que
            l'ouverture pointe les connectés, leur bouton « Présent » est plein
            comme celui d'une personne cochée à la main — sans elle, plus rien
            à l'écran ne dirait d'où vient ce pointage. Elle reste ensuite,
            quel que soit l'état posé : elle parle de la connexion, pas de
            l'appel. */}
        {enLigne && (
          <>
            <span className="appel-pastille" aria-hidden="true" />
            <span className="visuellement-cache">en ligne</span>
          </>
        )}
      </span>

      <span className="appel-nom">
        {nom}
        {/* « pas encore appelé » et non « aucune présence cette année » : la
            ligne ne parle plus que de cette réunion, elle ne peut plus rien
            dire de l'exercice. */}
        <small>{assiduite || (ligne.etat ? `${ligne.etat.toLowerCase()}` : 'pas encore appelé')}</small>
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
              data-propose={propose === etat || undefined}
              aria-pressed={ligne.etat === etat}
              aria-label={
                propose === etat ? `${etat} — ${nom}, en ligne, à confirmer` : `${etat} — ${nom}`
              }
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
 * Le registre de l'exercice, **rangé par date**, de la plus ancienne à la plus
 * récente.
 *
 * C'est une chronologie, comme dans les deux autres cadres de l'écran : on
 * suit l'exercice dans son ordre, et une réunion se retrouve là où on l'attend.
 * Les présences restent lisibles colonne par colonne, mais elles ne commandent
 * plus l'ordre des lignes.
 */
function Registre({
  lignes,
  ouverte,
  adresse,
  peutEffacer,
}: {
  lignes: LigneDeRegistre[];
  ouverte: string;
  adresse: Adresse;
  peutEffacer: boolean;
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
        De la réunion la plus ancienne à la plus récente. Les dates d’exercice viennent des
        paramètres de l’application ; une réunion hors de ces bornes ne compte pas.
      </p>

      <TableauDuRegistre
        lignes={rangerParDate(lignes)}
        ouverte={ouverte}
        adresse={adresse}
        peutEffacer={peutEffacer}
      />
    </section>
  );
}

/**
 * « Les réunions retirées » — ce qu'on a sorti du registre, et qu'on peut y
 * remettre.
 *
 * Sans cette liste, retirer une réunion revenait à la perdre : elle quittait
 * les deux registres, et il fallait connaître son adresse pour la rendre —
 * donc l'avoir notée **avant** de la retirer. « Retirer n'est pas effacer »
 * n'était vrai que pour qui avait pris ses précautions.
 *
 * Toutes dates confondues, contrairement aux deux registres : une réunion
 * retirée l'an dernier, ou depuis la clôture, tombait dans le même trou.
 *
 * Rangées par date de réunion, comme les deux registres, et non par date de
 * retrait : on vient y chercher une réunion qu'on situe par le jour où elle
 * s'est tenue, pas par celui où quelqu'un l'a sortie du registre.
 *
 * Le cadre reste affiché même vide. Il est toujours à la même place, donc
 * l'écran ne change pas de forme d'une visite à l'autre.
 *
 * **Replié par défaut.** C'est une réserve, pas un registre : on y va quand on
 * cherche quelque chose, et le reste du temps il n'a pas à pousser les deux
 * autres cadres vers le bas. `<details>` fait cela sans une ligne de script —
 * le repli fonctionne même si le JavaScript ne charge pas.
 */
function Retirees({ lignes, adresse }: { lignes: LigneDeRegistre[]; adresse: Adresse }) {
  return (
    <details className="bloc repli" style={{ marginTop: '1rem' }}>
      <summary>
        <h2>Les réunions retirées</h2>
        <span className="compte">
          {lignes.length === 0
            ? 'aucune'
            : `${lignes.length} réunion${lignes.length > 1 ? 's' : ''}`}
        </span>
      </summary>

      <p className="maigre">
        Retirer n’est pas effacer. L’appel de ces réunions est resté en base : les rendre
        au registre remet leurs pointages au compte de l’exercice.
      </p>

      {lignes.length === 0 ? (
        <p className="vide-liste">Aucune réunion retirée.</p>
      ) : (
        <div className="table-large">
          <table className="registre">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Retirée</th>
                <th scope="col" className="n">Présents</th>
                <th scope="col" className="n">Excusés</th>
                <th scope="col">
                  <span className="visuellement-cache">Gestes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rangerParDate(lignes).map((r) => (
                <tr key={r.id}>
                  <td>
                    <time dateTime={r.tenue_le}>{dateEnLettres(r.tenue_le)}</time>
                    {r.lieu && <small className="maigre"> · {r.lieu}</small>}
                    {/* Rendue, elle ne compterait toujours pas : le dire ici
                        évite d'attendre des chiffres qui ne viendront pas. */}
                    {r.hors_exercice && <small className="maigre"> · hors exercice</small>}
                  </td>
                  <td className="maigre">
                    {r.retire_le ? dateEnLettres(r.retire_le.slice(0, 10)) : '—'}
                    {r.retire_par_nom && <small> · {r.retire_par_nom}</small>}
                  </td>
                  <td className="n">{r.presents}</td>
                  <td className="n">{r.excuses}</td>
                  <td>
                    <span className="gestes">
                      <Link
                        href={`/espace/reunion?appel=${r.id}`}
                        className="geste geste--corriger"
                        aria-label={`Voir l’appel du ${dateEnLettres(r.tenue_le)}`}
                        title="Voir l’appel, sans la rendre"
                      >
                        <Stylo />
                      </Link>
                      <Link
                        href={adresse({ rendre: r.id })}
                        className="geste"
                        aria-label={`Rendre la réunion du ${dateEnLettres(r.tenue_le)} au registre`}
                        title="Rendre au registre"
                      >
                        <FlecheRetour />
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
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
 * Ordre chronologique, la plus ancienne d'abord, comme les deux autres cadres :
 * sur un registre d'archives on cherche une date, pas un classement.
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

      <TableauDuRegistre
        lignes={rangerParDate(lignes)}
        ouverte={ouverte}
        adresse={adresse}
        periode
      />
    </section>
  );
}

/** Le tableau, commun aux deux registres : mêmes colonnes, mêmes gestes. */
function TableauDuRegistre({
  lignes,
  ouverte,
  adresse,
  periode = false,
  peutEffacer = false,
}: {
  lignes: LigneDeRegistre[];
  ouverte: string;
  adresse: Adresse;
  /** Dire de quel côté des bornes chaque réunion tombe. */
  periode?: boolean;
  /**
   * Montrer le geste d'effacement. Faux partout sauf au registre de
   * l'exercice : c'est le seul cadre qui le porte.
   */
  peutEffacer?: boolean;
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
                  {/* Effacer est un second geste, et non la corbeille : celle-ci
                      se défait, celui-là non. Il ne s'affiche ni pour qui n'en
                      a pas le droit, ni sur une réunion reprise de Bubble —
                      que la prochaine reprise recréerait. Un bouton qui échoue
                      toujours vaut moins qu'un bouton qui n'est pas là. */}
                  {peutEffacer && !r.venue_de_bubble && (
                    <Link
                      href={adresse({ effacer: r.id })}
                      className="geste geste--effacer"
                      aria-label={`Effacer définitivement la réunion du ${dateEnLettres(r.tenue_le)}`}
                      title="Effacer pour de bon"
                    >
                      <Croix />
                    </Link>
                  )}
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

/**
 * La fenêtre de confirmation avant de rendre une réunion au registre.
 *
 * Le geste n'est pas dangereux — il répare, il ne détruit rien. Mais il
 * modifie l'assiduité de toute la loge d'un coup, et cela se dit avant, pas
 * après.
 */
function FenetreDeRetour({ reunion, fermer }: { reunion: LigneDeRegistre; fermer: string }) {
  const pointes = reunion.presents + reunion.excuses;

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien rendre" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retour-reunion">
        <h2 id="retour-reunion">
          Rendre la réunion du {dateEnLettres(reunion.tenue_le)} au registre&nbsp;?
        </h2>

        <p>
          Elle a été retirée
          {reunion.retire_par_nom ? ` par ${reunion.retire_par_nom}` : ''}
          {reunion.retire_le ? `, le ${dateEnLettres(reunion.retire_le.slice(0, 10))}` : ''}.{' '}
          {pointes === 0 ? (
            <>Personne n’y avait été appelé : la rendre ne changera aucun compteur.</>
          ) : (
            <>
              Ses{' '}
              <strong>
                {reunion.presents} présence{reunion.presents > 1 ? 's' : ''} et{' '}
                {reunion.excuses} excuse{reunion.excuses > 1 ? 's' : ''}
              </strong>{' '}
              n’ont jamais quitté la base : la rendre les remet au compte de l’exercice.
            </>
          )}
        </p>

        {/* Rendue, une réunion hors bornes reste hors bornes. Le taire ferait
            attendre des chiffres qui ne viendraient pas. */}
        {reunion.hors_exercice && (
          <p className="aide">
            Cette réunion tombe hors de l’exercice en cours : rendue, elle reparaîtra au
            registre de l’exercice passé, et ne comptera toujours dans aucun total.
          </p>
        )}

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/reunions/${reunion.id}/retirer`}>
            <input type="hidden" name="geste" value="rendre" />
            <input type="hidden" name="retour" value="/espace/reunion" />
            <button className="bouton bouton--fort" type="submit">
              Rendre au registre
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * La fenêtre de confirmation avant d'effacer une réunion pour de bon.
 *
 * Celle-ci n'a pas de symétrique : rien ne défait ce geste. Elle le dit deux
 * fois — dans la phrase et dans le libellé du bouton — parce qu'elle voisine
 * avec la corbeille, qui, elle, se rattrape.
 */
function FenetreDEffacement({
  reunion,
  fermer,
}: {
  reunion: LigneDeRegistre;
  fermer: string;
}) {
  const pointes = reunion.presents + reunion.excuses;

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien effacer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="effacement-reunion">
        <h2 id="effacement-reunion">
          Effacer la réunion du {dateEnLettres(reunion.tenue_le)}&nbsp;?
        </h2>

        <p>
          {pointes === 0 ? (
            <>
              Personne n’y a été appelé. La réunion quittera la base, et{' '}
              <strong>rien ne la ramènera</strong>.
            </>
          ) : (
            <>
              La réunion et ses{' '}
              <strong>
                {pointes} pointage{pointes > 1 ? 's' : ''}
              </strong>{' '}
              quitteront la base. <strong>Rien ne les ramènera.</strong>
            </>
          )}
        </p>

        {/* La différence d'avec la corbeille, écrite noir sur blanc : les deux
            gestes se ressemblent, leurs conséquences non. */}
        <p className="aide">
          Ce n’est pas un retrait. Si vous voulez seulement la sortir du registre en
          gardant l’appel, fermez cette fenêtre et prenez la corbeille.
        </p>

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/reunions/${reunion.id}/effacer`}>
            <input type="hidden" name="retour" value="/espace/reunion" />
            <button className="bouton bouton--danger" type="submit">
              Effacer pour de bon
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
