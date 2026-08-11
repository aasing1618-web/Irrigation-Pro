/**
 * Bandeau « une nouvelle version est disponible ».
 *
 * Trois partis pris, tous dans le même esprit — ne jamais interrompre :
 *
 * 1. **En bas de l'écran, dans le flux**, et non flottant par-dessus le
 *    contenu : il pousse la zone de travail de quelques dizaines de pixels au
 *    lieu de masquer une ligne de tableau ou un bouton.
 * 2. **`role="status"`, pas `alert`** : un lecteur d'écran l'annonce à la
 *    prochaine pause, il ne coupe pas la lecture en cours. Ce n'est pas une
 *    urgence.
 * 3. **Le rechargement est un clic de l'utilisateur.** Recharger tout seul
 *    ferait disparaître un formulaire de calcul à moitié rempli.
 */

import { Button } from './Button';
import { CloseIcon, RetryIcon } from './icons';

export interface UpdateBannerProps {
  /** Version publiée, telle que lue dans `version.json`. */
  version: string;
  /** Recharge la page ; injectable pour les tests. */
  onReload?: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ version, onReload, onDismiss }: UpdateBannerProps) {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 bg-surface px-5 py-2.5"
    >
      <p className="min-w-0 flex-1 text-sm text-ink-600">
        Une nouvelle version d’Irrigation&nbsp;Pro est disponible.{' '}
        <span className="text-ink-400" data-numeric>
          Version&nbsp;{version}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          icon={<RetryIcon />}
          onClick={() => (onReload ?? (() => window.location.reload()))()}
        >
          Recharger
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label="Fermer cette information"
          onClick={onDismiss}
        >
          <span aria-hidden="true">
            <CloseIcon />
          </span>
        </Button>
      </div>
    </div>
  );
}
