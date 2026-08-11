/**
 * Écran de refus de démarrage : la configuration du dashboard est invalide.
 *
 * C'est presque toujours la même cause — `VITE_API_URL` absent, ou en
 * « http:// » ailleurs qu'en développement local. Le dashboard **refuse alors
 * de démarrer** plutôt que de fonctionner en clair : ce sont les identifiants du
 * propriétaire, les adresses e-mail de ses clients et les mots de passe
 * temporaires qu'il vient de tirer qui circulent sur ce lien.
 *
 * L'écran s'adresse à la personne qui installe, pas au propriétaire : il donne
 * le message exact et le nom de la variable à corriger.
 */

import { BrandBackdrop, BrandLockup } from './BrandBackdrop';
import { FormAlert } from './FormAlert';
import { AlertIcon } from './icons';

export function ConfigurationErrorScreen({ detail }: { detail: string }) {
  return (
    <BrandBackdrop width="md">
      <BrandLockup as="plain" compact tagline={null} />

      <section className="mt-7 rounded-xl border border-ink-100 bg-surface p-6 shadow-overlay">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">
          Le dashboard ne peut pas démarrer
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          Sa configuration est incomplète ou refusée. Aucun appel réseau n’a été
          tenté.
        </p>

        <FormAlert tone="danger" icon={<AlertIcon />} className="mt-5">
          {detail}
        </FormAlert>

        <p className="mt-5 border-t border-ink-100 pt-5 text-sm leading-relaxed text-ink-500">
          Corrigez la variable <code className="font-mono text-ink-700">VITE_API_URL</code>{' '}
          dans le fichier <code className="font-mono text-ink-700">.env</code> du dossier{' '}
          <code className="font-mono text-ink-700">admin/</code>, puis relancez.
        </p>
      </section>
    </BrandBackdrop>
  );
}
