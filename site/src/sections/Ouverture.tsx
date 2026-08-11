/**
 * L'ouverture de la page.
 *
 * Même scène que l'écran de lancement du logiciel : fond bleu-vert profond,
 * halo unique et sourd, marque au centre de gravité. Le visiteur qui installera
 * l'application retrouvera exactement cette image.
 *
 * À droite, la chaîne de calcul du produit. Ce n'est pas une capture d'écran —
 * il n'y en a aucune sur ce site — mais le schéma d'architecture réel, celui de
 * `docs/MOTEUR-GRAVITAIRE.md` § 1 : chaque module reprend les résultats du
 * précédent.
 */

import { LienWhatsApp } from '../components/LienWhatsApp';
import { Contenu } from '../components/Section';
import { ETAPES_DU_PIPELINE, NOMBRE_DE_MODULES } from '../contenu';

export function Ouverture() {
  return (
    <div
      id="haut"
      data-surface="dark"
      className="relative overflow-hidden bg-brand-950 pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-28"
    >
      {/* Halo unique et sourd : de la profondeur sur un fond plat, sans devenir
          un dégradé décoratif. Repris tel quel de `BrandBackdrop`. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 size-[52rem] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-70"
        style={{
          background: 'radial-gradient(circle, var(--color-brand-900) 0%, transparent 68%)',
        }}
      />

      <Contenu className="relative">
        <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <h1
              className="animate-entree max-w-[18ch] text-accroche font-semibold tracking-[-0.03em] text-white"
              style={{ animationDelay: '60ms' }}
            >
              Dimensionner un périmètre irrigué, sans le classeur Excel.
            </h1>

            <p
              className="animate-entree mt-7 max-w-[54ch] text-lg text-brand-100"
              style={{ animationDelay: '140ms' }}
            >
              Irrigation Pro reprend les calculs d’irrigation gravitaire et sous pression —
              doses, besoins en eau, canaux, réseaux, pompage. Il les exécute sur un serveur,
              les archive projet par projet, et en sort une note de calcul PDF.
            </p>

            <p
              className="animate-entree mt-4 max-w-[54ch] text-brand-300"
              style={{ animationDelay: '200ms' }}
            >
              Un logiciel professionnel pour ingénieurs agronomes, bureaux d’études et
              installateurs en irrigation.
            </p>

            <div className="animate-entree mt-10" style={{ animationDelay: '280ms' }}>
              <LienWhatsApp ton="surSombre" />
              <p className="mt-4 max-w-[46ch] text-sm text-brand-300">
                C’est la seule façon d’obtenir un accès : les comptes sont ouverts à la main,
                après une conversation.
              </p>
            </div>
          </div>

          <ChaineDeCalcul />
        </div>
      </Contenu>
    </div>
  );
}

/**
 * La chaîne de calcul, dessinée.
 *
 * Un rail vertical et six repères : le principe du produit tient en une image,
 * et cette image est vraie. Les étapes viennent de `contenu.ts`, elles ne sont
 * pas recopiées ici.
 */
function ChaineDeCalcul() {
  const dernier = ETAPES_DU_PIPELINE.length - 1;

  return (
    <figure
      className="animate-entree m-0 rounded-xl border border-white/10 bg-brand-900/45 p-6 sm:p-8"
      style={{ animationDelay: '360ms' }}
    >
      <figcaption className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-300">
        La chaîne de calcul
      </figcaption>

      <ol className="mt-6 space-y-0">
        {ETAPES_DU_PIPELINE.map((etape, index) => {
          const estDernier = index === dernier;
          return (
            <li key={etape} className="relative flex gap-4 pb-6 last:pb-0">
              {!estDernier && (
                // Le rail part du bas de la pastille (7 px de décalage + 11 px
                // de diamètre) et s'arrête exactement au sommet de la suivante.
                <span
                  aria-hidden="true"
                  className="absolute left-[5px] top-[18px] h-[calc(100%-11px)] w-px bg-white/15"
                />
              )}
              <span
                aria-hidden="true"
                className={
                  estDernier
                    ? 'relative mt-[7px] size-[11px] shrink-0 rounded-full bg-brand-300'
                    : 'relative mt-[7px] size-[11px] shrink-0 rounded-full border-2 border-brand-400 bg-brand-950'
                }
              />
              <span
                className={
                  estDernier
                    ? 'text-md font-medium text-brand-100'
                    : 'text-md text-brand-200'
                }
              >
                {etape}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-7 border-t border-white/10 pt-6 text-sm text-brand-300">
        Chaque étape reprend les résultats de la précédente. Une valeur peut être forcée à la
        main sans casser la suite — {NOMBRE_DE_MODULES} modules au total, gravitaire et sous
        pression réunis.
      </p>
    </figure>
  );
}
