// `windows_subsystem = "windows"` en production : lance l'application sans
// ouvrir de fenêtre de console noire derrière elle. En débogage, la console
// reste visible pour lire les messages.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    irrigation_pro_lib::run();
}
