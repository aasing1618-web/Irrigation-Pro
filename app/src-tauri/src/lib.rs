//! Coque desktop d'Irrigation Pro.
//!
//! Volontairement minimale : toute l'interface est du web (React), et toute la
//! logique métier est sur le serveur (décision D-007). Cette couche ne fait
//! qu'ouvrir une fenêtre et y afficher l'interface.
//!
//! Aucune commande Tauri n'est exposée en Vague 0 : moins il y a de ponts
//! entre le web et le système, moins il y a de surface d'attaque.

/// Démarre l'application.
///
/// # Panique
///
/// Si la fenêtre principale ne peut pas être créée (WebView2 absent du poste,
/// configuration invalide), le démarrage est interrompu : il n'y a pas de mode
/// dégradé possible sans fenêtre.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Irrigation Pro n'a pas pu démarrer.");
}
