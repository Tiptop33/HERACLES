import { quand, tempsPourCorriger, type MessageDuCandidat } from '@/lib/page-candidat';

/**
 * « Messages du candidat » (0105), sous l'onglet Suivi : ce que le candidat a
 * écrit depuis sa page. Un bloc à part du journal — décision du 25 novembre —,
 * lu par son référent et son parrain seulement. En lecture : le candidat
 * corrige ses messages 24 heures, personne d'autre ne les touche.
 */
export default function MessagesDuCandidatSurLaFiche({
  messages,
  maintenant,
}: {
  messages: MessageDuCandidat[];
  maintenant: number;
}) {
  return (
    <section className="bloc messages-du-candidat" aria-labelledby="messages-du-candidat-titre">
      <h2 id="messages-du-candidat-titre">Messages du candidat</h2>
      <p className="maigre">
        Écrits depuis sa page. Lus par vous et par le parrain ; les autres membres de la loge ne les voient pas.
      </p>
      {messages.length === 0 ? (
        <p className="maigre">Aucun message pour l’instant.</p>
      ) : (
        <ol>
          {messages.map((m) => {
            const reste = tempsPourCorriger(m.ecrit_le, maintenant);
            return (
              <li key={m.id} className={reste ? 'pc-vivant' : undefined}>
                <div className="pc-meta">
                  <span>{quand(m.ecrit_le, maintenant)}</span>
                  {m.corrige_le && <span>· corrigé</span>}
                  {reste ? (
                    <span className="pc-etiquette pc-etiquette--attente">
                      Le candidat peut encore le corriger ({reste})
                    </span>
                  ) : (
                    <span className="pc-etiquette pc-etiquette--clos">Conservé</span>
                  )}
                </div>
                <p className="pc-texte">{m.texte}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
