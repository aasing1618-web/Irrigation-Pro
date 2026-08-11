/**
 * Le site vitrine d'Irrigation Pro — une seule page, dans cet ordre.
 *
 * Pas de routeur : il n'y a rien d'autre à atteindre. Pas d'appel réseau : tout
 * le contenu est compilé dans la page. Le seul lien sortant est celui de
 * WhatsApp, et c'est le seul appel à l'action du site.
 */

import { EnTete } from './components/EnTete';
import { PiedDePage } from './components/PiedDePage';
import { Acces } from './sections/Acces';
import { AppelFinal } from './sections/AppelFinal';
import { Modules } from './sections/Modules';
import { Ouverture } from './sections/Ouverture';
import { PourQui } from './sections/PourQui';
import { Rapport } from './sections/Rapport';
import { Remplace } from './sections/Remplace';

export function App() {
  return (
    <>
      <EnTete />
      {/* `tabIndex={-1}` : sans lui, le lien d'évitement déplace le défilement
          mais pas le focus clavier, et la tabulation suivante repartirait du
          haut de la page. */}
      <main id="contenu" tabIndex={-1}>
        <Ouverture />
        <Remplace />
        <PourQui />
        <Modules />
        <Rapport />
        <Acces />
        <AppelFinal />
      </main>
      <PiedDePage />
    </>
  );
}
