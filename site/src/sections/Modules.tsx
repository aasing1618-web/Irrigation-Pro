/**
 * Les modules de calcul réellement disponibles.
 *
 * C'est la section la plus substantielle du site, et la plus vérifiable : la
 * liste est celle du registre du moteur (`backend/src/engine/index.ts`). Aucun
 * module n'y est ajouté pour faire nombre, aucun n'est annoncé « bientôt ».
 *
 * Mise en page éditoriale : le titre de famille tient sa colonne à gauche, les
 * modules défilent à droite, séparés par un filet. Pas de grille de cartes
 * identiques — un ingénieur lit une liste de modules comme un sommaire, pas
 * comme une vitrine.
 */

import { Section } from '../components/Section';
import { FAMILLES_DE_MODULES, NOMBRE_DE_MODULES } from '../contenu';

export function Modules() {
  return (
    <Section
      id="modules"
      fond="surface"
      titre={`${NOMBRE_DE_MODULES} modules de calcul`}
      chapeau="Portés depuis deux classeurs de référence en irrigation, puis vérifiés un à un. Les formules s’exécutent sur le serveur : elles ne descendent jamais dans le navigateur."
    >
      <div className="space-y-14 lg:space-y-16">
        {FAMILLES_DE_MODULES.map((famille) => (
          <div
            key={famille.id}
            className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-12"
          >
            <div className="lg:pt-6">
              <h3 className="text-xl">{famille.titre}</h3>
              <p className="mt-2 text-sm text-ink-500">{famille.sousTitre}</p>
            </div>

            <ul className="min-w-0">
              {famille.modules.map((module) => (
                <li key={module.nom} className="border-t border-ink-100 py-5">
                  <h4 className="text-md font-semibold text-ink-900">{module.nom}</h4>
                  <p className="mt-1.5 max-w-[70ch] text-ink-600">{module.resume}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-14 max-w-[70ch] border-t border-ink-200 pt-6 text-ink-600">
        Les seize cas de référence des deux classeurs d’origine sont reproduits par le moteur à{' '}
        <span data-numeric>
          10<sup>−6</sup>
        </span>{' '}
        près, et rejoués à chaque modification du code.
      </p>
    </Section>
  );
}
