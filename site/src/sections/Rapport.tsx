/**
 * Ce que produit le logiciel : la note de calcul.
 *
 * L'ordre des parties est celui du document réellement généré — il est donc
 * numéroté, parce que la séquence porte de l'information. Il n'y a pas d'aperçu
 * du PDF sur cette page : une capture fabriquée pour la vitrine vaudrait moins
 * que la description exacte de ce que le document contient.
 */

import { Section } from '../components/Section';
import { PARTIES_DU_RAPPORT } from '../contenu';

export function Rapport() {
  return (
    <Section
      id="rapport"
      fond="creux"
      titre="Une note de calcul, pas une feuille de résultats"
      chapeau="Le rapport est produit sur le serveur, en une action, à partir des calculs archivés dans le projet. Il porte une référence — RAP-2026-0002, par exemple — que votre propre client peut citer."
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-16">
        <ol className="min-w-0">
          {PARTIES_DU_RAPPORT.map((partie, index) => (
            <li
              key={partie.titre}
              className="flex gap-5 border-t border-ink-200 py-5 first:border-t-0 first:pt-0 sm:gap-7"
            >
              <span
                aria-hidden="true"
                className="shrink-0 pt-0.5 text-sm font-semibold text-brand-500"
                data-numeric
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="text-md font-semibold text-ink-900">{partie.titre}</h3>
                <p className="mt-1 max-w-[62ch] text-ink-600">{partie.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <aside className="rounded-lg border border-ink-200 bg-surface p-6">
          <h3 className="text-lg">Ce qui n’y figure pas</h3>
          <p className="mt-3 text-ink-600">
            Aucune formule n’apparaît dans le document. Les hypothèses, en revanche, y sont
            toutes, avec leurs unités — y compris la rugosité retenue. Une note de calcul qui
            tait ses hypothèses n’est pas défendable devant un confrère.
          </p>
          <p className="mt-4 text-ink-600">
            Les avertissements métier ne peuvent pas être retirés du rapport. C’est exactement
            ce qui le distingue du tableur qu’il remplace.
          </p>
        </aside>
      </div>
    </Section>
  );
}
