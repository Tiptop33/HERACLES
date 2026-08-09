import { dateEnLettres } from '@/lib/format';
import { lireLExercice, ouEnEstLExercice, phraseDeRefusExercice } from '@/lib/exercice';
import { RUBRIQUES } from '@/lib/parametres';

export const metadata = { title: 'Exercice — Paramètres — HERACLES' };

function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/**
 * Les dates d'exercice.
 *
 * Deux champs, et c'est tout — mais ces deux dates commandent tout ce qui se
 * compte sur l'écran « Réunion ». La page le dit, et surtout elle dit **où
 * l'on en est** : un exercice terminé met tous les compteurs à zéro sans que
 * rien ne le signale ailleurs. C'est exactement ce qui s'est produit après le
 * 31 juillet 2026, et personne ne pouvait le corriger depuis l'application.
 */
export default async function Exercice({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string | string[]; regle?: string | string[] }>;
}) {
  const parametres = await searchParams;
  const exercice = await lireLExercice();

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = ouEnEstLExercice(exercice, aujourdhui);

  const refus = phraseDeRefusExercice(premier(parametres.erreur));
  const regle = premier(parametres.regle) === '1' && !refus;
  const propos = RUBRIQUES.find((r) => r.libelle === 'Exercice')?.propos ?? '';

  return (
    <>
      <h2>Exercice</h2>
      <p className="aide">{propos}</p>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      {regle && (
        <p className="etat etat--suivi" role="status">
          Les dates d’exercice sont enregistrées.
        </p>
      )}

      {/* Où l'on en est, dit avant les champs. Un exercice clos ne se voit pas
          sur l'écran « Réunion » : les compteurs y sont simplement à zéro, ce
          qui ressemble à une panne et n'en est pas une. */}
      {etat === 'termine' && (
        <p className="erreur" role="alert">
          <strong>Cet exercice est terminé</strong> depuis le{' '}
          {exercice.fin ? dateEnLettres(exercice.fin) : '—'}. Les réunions tenues depuis
          n’entrent dans aucun compteur d’assiduité, et n’apparaissent pas au registre de
          l’exercice. Reportez la date de fin pour qu’elles y reviennent.
        </p>
      )}

      {etat === 'a-venir' && (
        <p className="aide">
          Cet exercice n’a pas encore commencé : il s’ouvre le{' '}
          {exercice.debut ? dateEnLettres(exercice.debut) : '—'}. D’ici là, rien ne se
          compte.
        </p>
      )}

      {etat === 'inconnu' && (
        <p className="erreur" role="alert">
          Aucun exercice n’est défini. Tant qu’il manque une borne, les compteurs
          d’assiduité ne veulent rien dire.
        </p>
      )}

      {etat === 'en-cours' && exercice.debut && exercice.fin && (
        <p className="aide">
          Exercice en cours : du {dateEnLettres(exercice.debut)} au{' '}
          {dateEnLettres(exercice.fin)}.
        </p>
      )}

      <form className="exercice" method="post" action="/api/parametres/exercice">
        <input type="hidden" name="retour" value="/espace/parametres/exercice" />

        <label className="champ">
          <span>Début de l’exercice</span>
          <input type="date" name="debut" defaultValue={exercice.debut ?? ''} required />
        </label>

        <label className="champ">
          <span>Fin de l’exercice</span>
          <input type="date" name="fin" defaultValue={exercice.fin ?? ''} required />
        </label>

        <button className="bouton bouton--fort" type="submit">
          Enregistrer
        </button>
      </form>

      <p className="aide">
        Ces deux dates valent pour toutes les loges. Elles décident de deux choses :
        quelles réunions figurent au registre de l’exercice, et combien de présences et
        d’excuses s’affichent sous chaque nom à l’appel. Rien n’est effacé quand elles
        changent — les réunions d’un exercice passé restent en base, et se retrouvent dans
        « Le registre de l’exercice passé ».
      </p>
    </>
  );
}
