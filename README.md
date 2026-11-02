# BudgetAnalyze

Suivi de budget multi-banques et multi-devises à partir des **relevés exportés** (aucun identifiant bancaire, aucune API d'agrégation).
Application web installable (PWA), 100 % locale, publiée gratuitement sur GitHub Pages.

**En ligne :** https://romaintrial8.github.io/Budgetanalyze/

## Ce que fait l'app
- **Import** de relevés : Revolut (CSV/Excel, EUR et USD dans le même fichier), Bank of America (PDF mensuel, y compris enregistré depuis un iPhone ; CSV ; QFX), Crédit Agricole (PDF « relevé de comptes » ; CSV), OFX/QFX, CSV générique, fichier Budget Excel (prévisionnel + journal), export CSV de l'app.
- **Contrôle à la lecture** : totaux, soldes de début et de fin, ou solde ligne à ligne recalculés et comparés au relevé (✓ / ⚠). Lignes écartées ou non reconnues listées, jamais devinées.
- **Dédoublonnage** par empreinte (compte + date + montant + rang) : réimporter des relevés qui se chevauchent ne crée aucun doublon, même entre un PDF et un CSV du même compte.
- **Virements internes** écartés des dépenses et revenus : montants qui se répondent entre deux comptes, nom du titulaire dans le libellé, changes Revolut EUR ↔ USD.
- **Catégories** automatiques (marchands courants), règles apprises à chaque correction (« appliquer aux opérations similaires »), choix manuel prioritaire.
- **Budget** : enveloppes mensuelles par catégorie, **objectifs d'épargne mois par mois**, cumul face à l'objectif.
- **Analyse** : répartition par famille et catégorie, tendances revenus / dépenses, **abonnements et prélèvements récurrents détectés**.
- Devise de référence USD ou EUR (taux BCE du jour de chaque opération), thème clair / sombre, export CSV, sauvegarde JSON.

## Développement
```bash
npm install
npm test          # tests du domaine (lecteurs, calculs) sur des relevés anonymisés
npm run typecheck
npm run build     # dist/
npm run dev       # http://127.0.0.1:5173
```
Architecture identique à PEAnalyze / CryptoAnalyze : React 19 + TypeScript strict, esbuild, domaine en fonctions pures testées (`src/domain`), état local (`src/data/store.ts`), synchronisation Firebase optionnelle (`src/data/firebase-config.ts` vide = 100 % local), pdf.js chargé à la demande pour les PDF.

**Données personnelles :** jamais de relevé, de nom, d'IBAN ni de montant réel dans le dépôt. Les fichiers de travail réels restent dans `private/` (exclu par `.gitignore`).
