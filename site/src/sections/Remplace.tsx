/**
 * « Ce que le classeur ne fait pas ».
 *
 * Une comparaison en deux colonnes, sans triomphalisme : la colonne de gauche
 * décrit les limites d'un classeur de calcul, celle de droite le comportement
 * effectif du logiciel. Chaque affirmation de droite est vérifiable dans le
 * produit ; aucune n'est un argument de vente.
 */

import { Section } from '../components/Section';
import { COMPARAISONS } from '../contenu';

const ETIQUETTE = 'text-2xs font-semibold uppercase tracking-[0.14em]';

export function Remplace() {
  return (
    <Section
      id="remplace"
      fond="surface"
      titre="Ce que le classeur ne fait pas"
      chapeau="Les formules de dimensionnement sont justes depuis longtemps. Ce qui manque à un tableur, c’est tout le reste : la mémoire des hypothèses, les garde-fous, et un document présentable au bout."
    >
      <div>
        <div className="hidden gap-12 pb-3 md:grid md:grid-cols-2">
          <p className={`${ETIQUETTE} text-ink-500`}>Dans un classeur</p>
          <p className={`${ETIQUETTE} text-brand-600`}>Dans Irrigation Pro</p>
        </div>

        {COMPARAISONS.map((ligne) => (
          <div
            key={ligne.logiciel}
            className="grid gap-4 border-t border-ink-100 py-7 md:grid-cols-2 md:gap-12"
          >
            <div>
              <p className={`${ETIQUETTE} mb-2 text-ink-500 md:hidden`}>Dans un classeur</p>
              <p className="text-ink-500">{ligne.classeur}</p>
            </div>
            <div>
              <p className={`${ETIQUETTE} mb-2 text-brand-600 md:hidden`}>Dans Irrigation Pro</p>
              <p className="text-ink-800">{ligne.logiciel}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
