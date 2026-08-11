/**
 * Le pied de page.
 *
 * Il porte la version du site — exigée par le cahier des charges de la Vague 4
 * — et une phrase que peu de sites peuvent écrire : celui-ci ne charge rien
 * depuis l'extérieur. C'est vérifié par un test, pas par une bonne intention.
 */

import { SITE_VERSION } from '../lib/version';
import { Contenu } from './Section';
import { BrandMark } from './icons';

export function PiedDePage() {
  return (
    <footer
      data-surface="dark"
      className="border-t border-white/10 bg-brand-950 py-12 text-sm text-brand-300"
    >
      <Contenu>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2.5 text-md font-semibold text-white">
              <span className="text-[1.4rem] text-brand-300">
                <BrandMark />
              </span>
              Irrigation&nbsp;Pro
            </p>
            <p className="mt-3 max-w-[42ch]">
              Logiciel de dimensionnement des périmètres irrigués, en gravitaire et sous
              pression.
            </p>
          </div>

          <div className="sm:text-right">
            <p>
              Version du site&nbsp;
              <span data-numeric className="text-brand-100">
                {SITE_VERSION}
              </span>
            </p>
            <p className="mt-3 max-w-[42ch]">
              Ce site ne charge aucune ressource extérieure et ne dépose aucun traceur.
            </p>
          </div>
        </div>
      </Contenu>
    </footer>
  );
}
