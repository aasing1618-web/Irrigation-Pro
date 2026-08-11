/**
 * Le dernier bloc avant le pied de page.
 *
 * Il ferme la page sur la même scène sombre que l'ouverture, et sur la même
 * action — la seule qu'offre ce site. Un visiteur qui a tout lu ne doit pas
 * avoir à remonter pour agir.
 */

import { LienWhatsApp } from '../components/LienWhatsApp';
import { Contenu } from '../components/Section';

export function AppelFinal() {
  return (
    <section
      aria-labelledby="appel-final-titre"
      data-surface="dark"
      className="relative overflow-hidden bg-brand-950 py-20 sm:py-24"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background: 'radial-gradient(circle, var(--color-brand-900) 0%, transparent 68%)',
        }}
      />

      <Contenu className="relative">
        <div className="max-w-[46ch]">
          <h2 id="appel-final-titre" className="text-3xl text-white">
            Une conversation, et vous saurez si c’est pour vous.
          </h2>
          <p className="mt-5 text-brand-200">
            Décrivez votre périmètre, votre type de réseau, ce que vous calculez aujourd’hui.
            La réponse vous dira franchement si Irrigation Pro vous fera gagner du temps.
          </p>
          <div className="mt-9">
            <LienWhatsApp ton="surSombre" />
          </div>
        </div>
      </Contenu>
    </section>
  );
}
