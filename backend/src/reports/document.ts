/**
 * Assemblage du document — c'est ici que le rapport prend sa forme.
 *
 * Ce fichier ne sait rien de la base de données ni du moteur : il reçoit un
 * `ContenuRapport` (voir `types.ts`) et le dessine avec les primitives de
 * `mise-en-page.ts`. Aucune coordonnée n'est écrite en dur ci-dessous ; tout
 * passe par `titreSection`, `tableau`, `encadre`… qui gèrent les sauts de page.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUE LE DOCUMENT CONTIENT — ET CE QU'IL NE CONTIENDRA JAMAIS
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contenu obligatoire (contrat d'API Vague 3, § 1) :
 *    • page de garde : projet, client final, localisation, date, référence,
 *      auteur du rapport ;
 *    • hypothèses retenues, avec leurs unités ;
 *    • résultats par module, en tableaux ;
 *    • **avertissements métier du moteur**, en encadré, jamais omis ;
 *    • version du moteur et date en pied de page ;
 *    • pagination et titre du projet en en-tête courant.
 *
 *  Interdits, sans exception :
 *    • aucune formule, aucun coefficient (décision D-007) — le savoir-faire
 *      reste sur le serveur, un PDF se transmet et se lit ;
 *    • aucun prix, aucune mention de licence (décision D-008).
 *
 *  Les avertissements apparaissent DEUX fois : en synthèse au début, puis dans
 *  la section du module concerné. C'est délibéré. Ce sont eux qui distinguent
 *  ce document du tableur qu'il remplace : un tableur ne dit pas qu'une vitesse
 *  d'écoulement sort de la plage admissible. Les enterrer en fin de document
 *  reviendrait à les supprimer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { COULEURS, Disposition, type ColonneTableau } from './mise-en-page.js';
import { formaterDate, formaterDateHeure } from './texte.js';
import type { BlocCalcul, ContenuRapport } from './types.js';

/** Options techniques de génération (les tests désactivent la compression). */
export interface OptionsGeneration {
  readonly compresser?: boolean;
}

const COLONNES_HYPOTHESES: readonly ColonneTableau[] = [
  { titre: 'Paramètre', poids: 52 },
  { titre: 'Valeur', poids: 28, alignement: 'right' },
  { titre: 'Unité', poids: 20 },
];

const COLONNES_RESULTATS: readonly ColonneTableau[] = [
  { titre: 'Grandeur', poids: 52 },
  { titre: 'Valeur', poids: 28, alignement: 'right' },
  { titre: 'Unité', poids: 20 },
];

/** Le document n'affiche pas les rangs bruts : « 3 » devient « Calcul n° 3 ». */
function intituleSection(rang: number, bloc: BlocCalcul): string {
  return `${rang}. ${bloc.nom}`;
}

/**
 * Produit le PDF complet.
 *
 * Renvoie un `Buffer` plutôt qu'un flux : le document est court (quelques
 * dizaines de kilo-octets), l'appelant doit pouvoir l'écrire sur disque **et**
 * en connaître la taille avant de répondre. Diffuser en flux compliquerait la
 * gestion d'erreur — un échec en cours de flux laisse une réponse HTTP à moitié
 * envoyée, impossible à transformer en erreur propre.
 */
export async function genererPdfRapport(
  contenu: ContenuRapport,
  options: OptionsGeneration = {},
): Promise<Buffer> {
  const { entete } = contenu;

  const disposition = new Disposition({
    titreCourant: entete.projetNom,
    repereCourant: entete.reference,
    mentionPied: `Irrigation Pro — moteur de calcul v${contenu.moteurVersion} — ${formaterDate(
      entete.genereLe,
    )}`,
    titreFichier: `Rapport ${entete.reference} — ${entete.projetNom}`,
    auteur: entete.auteurNom,
    compresser: options.compresser ?? true,
  });

  dessinerCouverture(disposition, contenu);
  disposition.nouvellePage();

  let rang = 1;
  dessinerSyntheseAvertissements(disposition, contenu, rang);
  rang += 1;

  for (const bloc of contenu.calculs) {
    dessinerBlocCalcul(disposition, bloc, rang);
    rang += 1;
  }

  dessinerObservations(disposition, contenu, rang);
  dessinerMentionFinale(disposition);

  return disposition.finaliser();
}

// ---------------------------------------------------------------------------
// Page de garde
// ---------------------------------------------------------------------------

function dessinerCouverture(d: Disposition, contenu: ContenuRapport): void {
  const { entete } = contenu;

  d.espace(80);
  d.surTitre('Étude d’irrigation');
  d.espace(10);
  d.titreDocument(entete.projetNom);
  d.espace(6);

  d.doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(COULEURS.attenue)
    .text('Rapport technique', d.gauche, d.doc.y, { width: d.largeurUtile });

  d.espace(26);
  d.filet(COULEURS.trait);
  d.espace(10);

  const lignes: Array<readonly [string, string]> = [
    ['Référence du rapport', entete.reference],
    ['Client final', entete.clientFinal ?? 'Non renseigné'],
    ['Localisation', entete.localisation ?? 'Non renseignée'],
    ['Date de génération', formaterDateHeure(entete.genereLe)],
    ['Établi par', entete.auteurNom],
  ];
  if (entete.auteurSociete) lignes.push(['Bureau d’études', entete.auteurSociete]);
  lignes.push(['Contact', entete.auteurEmail]);
  lignes.push([
    'Modules retenus',
    contenu.calculs.length === 1 ? '1 module de calcul' : `${contenu.calculs.length} modules de calcul`,
  ]);

  d.fiche(lignes);

  if (entete.descriptionProjet) {
    d.espace(8);
    d.sousTitre('Présentation du projet');
    d.paragraphe(entete.descriptionProjet);
  }

  d.espace(14);
  d.paragraphe(
    'Ce document présente les hypothèses retenues et les résultats de dimensionnement ' +
      'du projet ci-dessus. Les avertissements techniques signalés dans les pages ' +
      'suivantes font partie intégrante de l’étude et doivent être lus avant toute ' +
      'décision d’exécution.',
    { couleur: COULEURS.attenue, taille: 9 },
  );
}

// ---------------------------------------------------------------------------
// Synthèse des avertissements
// ---------------------------------------------------------------------------

/**
 * Regroupe les avertissements de tous les modules en tête de document.
 *
 * La section existe **même quand il n'y a aucun avertissement** : écrire noir
 * sur blanc « aucun avertissement » est une information, et l'absence de la
 * section laisserait planer un doute sur le fait qu'ils aient été vérifiés.
 */
function dessinerSyntheseAvertissements(d: Disposition, contenu: ContenuRapport, rang: number): void {
  d.titreSection(`${rang}. Avertissements techniques`);

  const attentions: string[] = [];
  const informations: string[] = [];

  for (const bloc of contenu.calculs) {
    for (const avertissement of bloc.avertissements) {
      const ligne = `${bloc.nom} — ${avertissement.message}`;
      if (avertissement.gravite === 'attention') attentions.push(ligne);
      else informations.push(ligne);
    }
    for (const remarque of bloc.remarques) {
      informations.push(`${bloc.nom} — ${remarque}`);
    }
  }

  if (attentions.length === 0 && informations.length === 0) {
    d.paragraphe(
      'Le moteur de calcul n’a émis aucun avertissement sur les calculs retenus dans ce rapport.',
    );
    return;
  }

  d.paragraphe(
    'Les points ci-dessous ont été relevés automatiquement par le moteur de calcul. ' +
      'Ils ne remettent pas en cause les résultats, mais demandent une vérification ' +
      'avant exécution.',
    { couleur: COULEURS.attenue },
  );

  if (attentions.length > 0) {
    d.encadre('Points à vérifier avant dimensionnement', attentions, 'attention');
  }
  if (informations.length > 0) {
    d.encadre('Hypothèses et informations retenues', informations, 'info');
  }
}

// ---------------------------------------------------------------------------
// Une section par module de calcul
// ---------------------------------------------------------------------------

function dessinerBlocCalcul(d: Disposition, bloc: BlocCalcul, rang: number): void {
  d.titreSection(intituleSection(rang, bloc));

  if (bloc.description) {
    d.paragraphe(bloc.description, { couleur: COULEURS.attenue });
  }

  d.paragraphe(
    `Calcul effectué le ${formaterDateHeure(bloc.calculeLe)} — moteur v${bloc.engineVersion}.`,
    { taille: 8.5, couleur: COULEURS.attenue, italique: true },
  );

  // --- Hypothèses ---------------------------------------------------------
  d.sousTitre('Hypothèses retenues');

  if (bloc.hypotheses.length === 0 && bloc.tableauxHypotheses.length === 0) {
    d.paragraphe('Aucune donnée d’entrée n’a été enregistrée pour ce calcul.', {
      couleur: COULEURS.attenue,
      italique: true,
    });
  } else if (bloc.hypotheses.length > 0) {
    d.tableau({
      colonnes: COLONNES_HYPOTHESES,
      lignes: bloc.hypotheses.map((ligne) => [ligne.libelle, ligne.valeur, ligne.unite]),
    });
  }

  for (const tableau of bloc.tableauxHypotheses) {
    d.sousTitre(tableau.titre);
    d.tableau({
      colonnes: tableau.colonnes.map((titre, index) => ({
        titre,
        poids: index === 0 ? 22 : 78 / Math.max(tableau.colonnes.length - 1, 1),
        alignement: index === 0 ? 'left' : 'right',
      })),
      lignes: tableau.lignes,
    });
  }

  // --- Résultats ----------------------------------------------------------
  d.sousTitre('Résultats');

  if (bloc.resultats.length === 0) {
    d.paragraphe('Aucun résultat exploitable n’a pu être repris pour ce module.', {
      couleur: COULEURS.attenue,
      italique: true,
    });
  } else {
    // Les grandeurs de synthèse d'abord : c'est ce qu'un client regarde.
    const ordonnes = [
      ...bloc.resultats.filter((ligne) => ligne.principal),
      ...bloc.resultats.filter((ligne) => !ligne.principal),
    ];
    d.tableau({
      colonnes: COLONNES_RESULTATS,
      lignes: ordonnes.map((ligne) => [
        ligne.principal ? `${ligne.libelle}  *` : ligne.libelle,
        ligne.valeur,
        ligne.unite,
      ]),
    });
    d.paragraphe('*  grandeurs de synthèse du module.', {
      taille: 7.5,
      couleur: COULEURS.attenue,
      italique: true,
    });
  }

  // --- Avertissements du module ------------------------------------------
  const attentions = bloc.avertissements
    .filter((a) => a.gravite === 'attention')
    .map((a) => a.message);
  const informations = [
    ...bloc.avertissements.filter((a) => a.gravite === 'info').map((a) => a.message),
    ...bloc.remarques,
  ];

  if (attentions.length > 0) {
    d.encadre('Avertissements sur ce module', attentions, 'attention');
  }
  if (informations.length > 0) {
    d.encadre('À noter', informations, 'info');
  }
}

// ---------------------------------------------------------------------------
// Observations libres et mention finale
// ---------------------------------------------------------------------------

function dessinerObservations(d: Disposition, contenu: ContenuRapport, rang: number): void {
  const notes = contenu.notes?.trim();
  if (!notes) return;

  d.titreSection(`${rang}. Observations`);
  for (const paragraphe of notes.split(/\n{2,}/)) {
    const texte = paragraphe.trim();
    if (texte.length > 0) d.paragraphe(texte);
  }
}

/**
 * Mention de clôture.
 *
 * Volontairement dépourvue de toute information commerciale : ni tarif, ni
 * durée de validité, ni licence. Ce document est une pièce technique, pas un
 * support de vente.
 */
function dessinerMentionFinale(d: Disposition): void {
  const disponible = d.limiteBasse - d.doc.y;
  if (disponible > 40) {
    d.espace(disponible - 40);
  } else {
    d.espace(14);
  }
  
  d.filet(COULEURS.traitFin);
  d.paragraphe(
    'Document produit automatiquement par Irrigation Pro à partir des données saisies ' +
      'par le bureau d’études. Les résultats dépendent des hypothèses listées ci-dessus ; ' +
      'toute modification de ces hypothèses impose de régénérer le rapport.',
    { taille: 8, couleur: COULEURS.attenue, italique: true },
  );
}
