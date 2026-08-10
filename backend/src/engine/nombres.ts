/**
 * Petites fonctions numériques partagées.
 *
 * Elles existent pour une seule raison : reproduire fidèlement le comportement
 * du tableur d'origine sans hériter des artefacts de l'arithmétique flottante.
 */

/**
 * Équivalent de `ROUNDUP(x, 0)` d'Excel pour des grandeurs positives.
 *
 * `Math.ceil` seul est piégeux ici : `619,8875 / 40` peut valoir
 * `15.497187500000002` en binaire, et un calcul comme `10 / 5` peut valoir
 * `2.0000000000000004`, ce qui donnerait 3 arrosages au lieu de 2. On absorbe
 * donc le bruit binaire (12 décimales) avant d'arrondir vers le haut.
 */
export function arrondiSuperieur(valeur: number): number {
  if (!Number.isFinite(valeur)) return valeur;
  const nettoye = Number.parseFloat(valeur.toPrecision(12));
  return Math.ceil(nettoye);
}

/** Équivalent de `INT(x)` d'Excel (troncature vers le bas) pour x ≥ 0. */
export function partieEntiere(valeur: number): number {
  if (!Number.isFinite(valeur)) return valeur;
  return Math.floor(Number.parseFloat(valeur.toPrecision(12)));
}
