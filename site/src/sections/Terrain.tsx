/**
 * Le terrain — la respiration de la page.
 *
 * ## Pourquoi cette section existe
 *
 * Le reste de la page explique des calculs. Or personne n'achète un logiciel de
 * calcul pour ses formules : on l'achète pour ce qu'il permet de faire sur une
 * parcelle. Cette section remet le métier sous les yeux, en grand, juste avant
 * la liste des modules.
 *
 * C'est aussi le seul moment spectaculaire du site, et il est unique par
 * décision : un site qui met en scène chacune de ses sections n'en met en
 * valeur aucune.
 *
 * ## Ce que cette section n'est pas
 *
 * Ce n'est **pas une capture d'écran du logiciel**, et il ne faut pas en
 * fabriquer (`CLAUDE.md`). C'est une photographie d'illustration, et la légende
 * le dit franchement plutôt que de laisser croire autre chose.
 */

import { MediaExpansif } from '../components/MediaExpansif';
import { RAMPE_ASPERSION } from '../photos';

export function Terrain() {
  return (
    <MediaExpansif
      photo={RAMPE_ASPERSION}
      titreGauche="Ce que le logiciel"
      titreDroite="dimensionne."
    >
      <p className="text-lg text-brand-100">
        Un réseau qui arrose trop consomme une ressource rare. Un réseau qui arrose mal coûte
        une récolte. C’est cet écart qu’Irrigation Pro calcule, module par module, de la dose
        d’arrosage jusqu’à la puissance de la pompe.
      </p>

      <p className="mt-5 text-brand-300">
        Photographie d’illustration. Le logiciel ne se montre pas ici : il se montre en
        conversation.
      </p>
    </MediaExpansif>
  );
}
