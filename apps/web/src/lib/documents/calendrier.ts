/**
 * Le calendrier des réunions de la commission.
 *
 * Elles se tiennent le **2e et le 4e mercredi** de chaque mois. Celle qui tombe
 * un jour férié est reportée — au lendemain par défaut, au mercredi suivant si
 * la commission l'a réglé ainsi (Paramètres › Mise en page › Compte rendu).
 *
 * Le cas n'a rien de théorique : le compte rendu du 28 octobre 2026 annonçait
 * la réunion suivante pour le 11 novembre, jour de l'Armistice.
 *
 * Tout se calcule en dates civiles « AAAA-MM-JJ », en UTC : un jour reste un
 * jour, quel que soit le fuseau du serveur qui imprime.
 */

export type Report = 'lendemain' | 'semaine' | 'aucun';

const JOUR = 86_400_000;

function versDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function versIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plus(d: Date, jours: number): Date {
  return new Date(d.getTime() + jours * JOUR);
}

/** Le dimanche de Pâques (calcul grégorien de Meeus / Jones / Butcher). */
export function paques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return versIso(new Date(Date.UTC(annee, mois - 1, jour)));
}

/** Les onze jours fériés de la métropole, pour une année. */
export function joursFeries(annee: number): Set<string> {
  const p = versDate(paques(annee))!;
  const fixe = (mois: number, jour: number) => versIso(new Date(Date.UTC(annee, mois - 1, jour)));
  return new Set([
    fixe(1, 1), // Jour de l'an
    versIso(plus(p, 1)), // Lundi de Pâques
    fixe(5, 1), // Fête du travail
    fixe(5, 8), // Victoire 1945
    versIso(plus(p, 39)), // Ascension
    versIso(plus(p, 50)), // Lundi de Pentecôte
    fixe(7, 14), // Fête nationale
    fixe(8, 15), // Assomption
    fixe(11, 1), // Toussaint
    fixe(11, 11), // Armistice
    fixe(12, 25), // Noël
  ]);
}

export function estFerie(iso: string): boolean {
  const d = versDate(iso);
  return d ? joursFeries(d.getUTCFullYear()).has(versIso(d)) : false;
}

/** Les 2e et 4e mercredis d'un mois, avant tout report. */
export function mercredisDuMois(annee: number, mois: number): [string, string] {
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  // 3 = mercredi. Décalage jusqu'au premier mercredi du mois.
  const decalage = (3 - premier.getUTCDay() + 7) % 7;
  const premierMercredi = plus(premier, decalage);
  return [versIso(plus(premierMercredi, 7)), versIso(plus(premierMercredi, 21))];
}

/** La date effective d'une réunion prévue ce jour-là. */
export function reporter(iso: string, report: Report): string {
  if (report === 'aucun') return iso;
  let d = versDate(iso);
  if (!d) return iso;
  // Une boucle, pas un seul pas : un report peut retomber sur un autre jour
  // férié. Huit tours suffisent largement ; la borne évite l'infini.
  for (let tour = 0; tour < 8 && estFerie(versIso(d)); tour += 1) {
    d = plus(d, report === 'lendemain' ? 1 : 7);
  }
  return versIso(d);
}

/** La prochaine réunion, strictement après ce jour. */
export function prochaineReunion(apres: string, report: Report = 'lendemain'): string | null {
  const depart = versDate(apres);
  if (!depart) return null;
  let annee = depart.getUTCFullYear();
  let mois = depart.getUTCMonth() + 1;
  for (let tour = 0; tour < 3; tour += 1) {
    for (const prevue of mercredisDuMois(annee, mois)) {
      const effective = reporter(prevue, report);
      if (effective > versIso(depart)) return effective;
    }
    mois += 1;
    if (mois > 12) {
      mois = 1;
      annee += 1;
    }
  }
  return null;
}
