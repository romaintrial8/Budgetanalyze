# BudgetAnalyze — mise en route (10 minutes)

## 1. Activer la publication (une seule fois)
1. Dépôt GitHub `Budgetanalyze` › **Settings** › **Pages** › *Source* : **GitHub Actions**.
2. Onglet **Actions** › « Publier BudgetAnalyze » : attendre la coche verte (2–3 min).
3. L'adresse de l'app : https://romaintrial8.github.io/Budgetanalyze/

## 2. Installer l'app sur l'iPhone
Ouvre l'adresse dans **Safari** › bouton Partager › **Sur l'écran d'accueil**.

## 3. Importer
App › icône ⬆︎ en haut à droite › **Choisir des fichiers** › sélectionne les relevés › vérifie l'aperçu (✓ verts) › **Importer**.
- **Bank of America** : app › compte › *Statements & Documents* › le mois › partager › Enregistrer dans Fichiers.
- **Revolut** : Accueil › compte › ⋯ › *Relevé* › Excel › période.
- **Crédit Agricole** : Ma Banque › *Mes documents* › *Relevés de compte*.
- **Fichier Budget Excel** : le prévisionnel devient enveloppes et objectifs d'épargne.

## 4. La revue mensuelle (10 minutes, le 6 du mois, après l'arrivée des relevés)
1. Importer les 3 relevés du mois.
2. Synthèse › « opérations à classer » : les classer (activer « Appliquer aux opérations similaires » pour que l'app apprenne).
3. Regarder l'épargne du mois face à l'objectif, et les enveloppes dépassées.
4. Une fois par trimestre : Analyse › Abonnements, résilier ce qui ne sert plus.

## 5. Facultatif — synchronisation iPhone ↔ ordinateur (Firebase, gratuit)
Même procédure que pour CryptoAnalyze (projet Firebase, connexion Google, règles `firestore.rules`, domaine `romaintrial8.github.io` autorisé), puis renseigner `src/data/firebase-config.ts`. Les données du budget sont rangées à part (`users/{uid}/budget/main`) : un même projet Firebase peut servir aux deux apps sans mélange.
Sans cette étape, les données restent sur l'appareil où tu importes : pense à **Paramètres › Sauvegarde complète**.
