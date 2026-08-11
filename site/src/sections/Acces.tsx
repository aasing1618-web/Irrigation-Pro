/**
 * Comment on obtient le logiciel.
 *
 * Le point délicat de la page, et il se règle en le disant franchement : rien
 * ne s'achète ici, rien ne s'ouvre tout seul. Un compte se crée à la main,
 * après une conversation. Ce n'est pas une étape manquante, c'est la façon dont
 * le produit est distribué.
 */

import { LienWhatsApp } from '../components/LienWhatsApp';
import { Section } from '../components/Section';
import { ETAPES_ACCES } from '../contenu';

export function Acces() {
  return (
    <Section
      id="acces"
      titre="Comment obtenir un accès"
      chapeau="Ce site ne vend rien et n’ouvre aucun compte. Il présente le logiciel, et vous met en relation. Tout le reste se règle dans la conversation."
    >
      <ol className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2">
        {ETAPES_ACCES.map((etape, index) => (
          <li key={etape.titre} className="bg-surface p-6 sm:p-7">
            <span
              aria-hidden="true"
              className="text-sm font-semibold text-brand-500"
              data-numeric
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-3 text-lg">{etape.titre}</h3>
            <p className="mt-2 text-ink-600">{etape.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <LienWhatsApp />
        <p className="max-w-[46ch] text-sm text-ink-500">
          Le message est déjà écrit ; il ne part que si vous appuyez sur « envoyer » dans
          WhatsApp.
        </p>
      </div>
    </Section>
  );
}
