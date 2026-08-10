/**
 * Version du moteur de calcul.
 *
 * Cette valeur accompagne **chaque résultat** produit par le moteur et doit être
 * archivée en base avec le calcul (`engine_version`). Elle permet, des années
 * plus tard, de savoir avec quelle version des formules un dimensionnement a été
 * produit — indispensable quand un ouvrage est contesté sur le terrain.
 *
 * Règle de versionnement :
 *  - correctif (1.0.x) : correction d'un bug sans changement de résultat attendu ;
 *  - mineure  (1.x.0) : ajout d'un module, sans modifier les modules existants ;
 *  - majeure  (x.0.0) : **tout changement qui modifie une valeur calculée**.
 */
export const ENGINE_VERSION = '1.0.0';
