// Configuration Web Firebase (PUBLIQUE par conception : elle identifie le projet, elle ne donne aucun droit ;
// la sécurité vient des règles Firestore et des domaines autorisés). Tant que apiKey est vide, l'app reste 100 % locale.
// Pour activer la connexion Google et la synchronisation : voir docs/GUIDE_MISE_EN_LIGNE.md, étape 3.
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
