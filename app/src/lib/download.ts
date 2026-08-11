/**
 * Enregistrement d'un fichier reçu du serveur sur le poste de l'utilisateur.
 *
 * ## Pourquoi ce détour
 *
 * Le PDF n'arrive pas par un lien mais par une requête authentifiée
 * (`apiFileRequest`) : on tient donc un `Blob` en mémoire, pas une URL que le
 * navigateur saurait télécharger tout seul. Le seul moyen de déclencher la
 * boîte « Enregistrer sous » depuis un `Blob` est de lui fabriquer une URL
 * objet et de cliquer sur un lien invisible qui la pointe.
 *
 * ## La fuite que ce fichier évite
 *
 * `URL.createObjectURL` retient le contenu du fichier **pour toute la durée de
 * vie du document**. Sans libération explicite, chaque téléchargement laisse
 * son PDF en mémoire — sans conséquence sur un site que l'on quitte, mais
 * Irrigation Pro est un logiciel qu'un bureau d'études laisse ouvert toute la
 * journée. Vingt rapports générés dans l'après-midi, ce sont vingt documents
 * retenus jusqu'à la fermeture. D'où le `revokeObjectURL` systématique.
 *
 * Il est différé de quelques centaines de millisecondes : la WebView lit l'URL
 * objet dans une tâche postérieure au clic, et la révoquer dans la foulée
 * annulerait le téléchargement au lieu de le libérer.
 */

/** Délai avant libération : assez pour que la WebView ait lu l'URL objet. */
const DELAI_LIBERATION_MS = 250;

/**
 * Propose l'enregistrement d'un contenu binaire sous le nom donné.
 *
 * Ne renvoie rien et ne lève rien : à ce stade le fichier est déjà arrivé, et
 * l'utilisateur voit la fenêtre de son système. Ce qui s'y passe ensuite —
 * dossier choisi, annulation — n'appartient plus à l'application.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener';
    // Certains moteurs ignorent le clic sur un élément hors du document.
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), DELAI_LIBERATION_MS);
  }
}
