# Quittances de loyer

Application web installable (PWA) pour générer des quittances de loyer en PDF et les envoyer depuis Android via Gmail. Usage strictement personnel, aucun serveur : toutes les données restent dans le navigateur du téléphone.

## Fonctions

- Locataires : civilité, nom, prénom, email, adresse du bien, loyer hors charges, charges.
- Sauvegarde locale : export / import d'un fichier JSON, effacement complet.
- Bailleur : identité, adresse, ville de signature.
- Signature électronique dessinée au doigt ou importée depuis une image (fond blanc rendu transparent).
- Quittance PDF A4 conforme au modèle usuel (montant en chiffres et en lettres, période, détail loyer / charges, date de paiement, mentions de la loi du 6 juillet 1989).
- Numérotation automatique `AAAA-MM-NNN` (mois de la période + séquence).
- Historique des quittances : réouverture, renvoi, suppression, détection des doublons.
- Envoi : bouton « Envoyer » → menu de partage Android → Gmail s'ouvre avec le PDF joint, l'objet et le message pré-remplis. L'adresse email du locataire est copiée dans le presse-papiers (le partage Android ne permet pas de pré-remplir le destinataire).
- Hors ligne : l'app fonctionne sans réseau une fois installée.

## Déploiement sur GitHub Pages

1. Crée un dépôt GitHub (public ou privé, Pages fonctionne dans les deux cas avec un compte gratuit pour un dépôt public).
2. Pousse ce dossier :

   ```bash
   git init
   git add .
   git commit -m "Quittances de loyer"
   git branch -M main
   git remote add origin git@github.com:Ghermin/la-quittance.git
   git push -u origin main
   ```

3. Sur GitHub : Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)` → Save.
4. Après une à deux minutes, l'app est en ligne sur `https://ghermin.github.io/la-quittance/`.

## Installation sur Android

1. Ouvre l'URL dans Chrome.
2. Menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran d'accueil »). Un bouton « Installer » apparaît aussi dans l'onglet Réglages de l'app.
3. Lance l'app depuis l'icône : elle s'ouvre en plein écran, sans barre d'adresse.

## Premier usage

1. Réglages → renseigne le bailleur, signe dans la zone puis « Enregistrer la signature ». Ajuste le modèle d'email si besoin.
2. Locataires → ajoute chaque locataire avec l'adresse du bien, le loyer et les charges.
3. Quittance → choisis le locataire et le mois, vérifie les montants, « Générer la quittance », puis « Envoyer ».

## Mise à jour de l'app

Pousse les modifications sur `main`. Le service worker sert la version en cache puis récupère la nouvelle en arrière-plan : la mise à jour est visible à l'ouverture suivante de l'app. Pour forcer le renouvellement du cache, incrémente `CACHE` dans `sw.js`.

## Données et sauvegarde

Les données sont stockées dans le `localStorage` du navigateur, sous la clé `quittance-loyer.v1`. Effacer les données de navigation de Chrome pour ce site, ou désinstaller l'app, les supprime.

Réglages → Données :

- **Exporter une sauvegarde** : dépose un fichier `quittances-sauvegarde-AAAA-MM-JJ.json` dans les téléchargements du téléphone (locataires, bailleur, signature, historique, modèle d'email). À conserver ailleurs (Drive, mail à soi-même…).
- **Importer une sauvegarde** : choisit un fichier JSON exporté par l'app et remplace toutes les données actuelles après confirmation. Fonctionne aussi pour changer de téléphone.
- **Tout effacer** : remet l'app à zéro après confirmation.

Chaque élément se supprime aussi individuellement : locataire, quittance de l'historique, signature.

## Développement

- Génération d'un PDF d'exemple et vérifications unitaires (nombres en lettres, formats de dates) :

  ```bash
  node tools/sample-pdf.js
  ```

  Le PDF est écrit dans `tools/out/`.

- Régénération des icônes et de la signature d'exemple (Windows PowerShell) :

  ```powershell
  powershell -ExecutionPolicy Bypass -File tools/make-assets.ps1
  ```

- Test local : n'importe quel serveur statique à la racine du dossier, par exemple `npx serve .`, puis ouvrir `http://localhost:3000`.

## Structure

```
index.html               Interface (4 onglets : Quittance, Locataires, Historique, Réglages)
css/app.css              Styles mobile-first
js/app.js                Logique : stockage local, formulaires, signature, partage
js/pdf.js                Construction du PDF, montant en lettres, dates en français
js/vendor/jspdf.umd.min.js  jsPDF 2.5.2
manifest.webmanifest     Manifest PWA
sw.js                    Service worker (cache hors ligne)
icons/                   Icônes PWA
tools/                   Scripts de génération (icônes, PDF d'exemple)
```

## Limites connues

- Le destinataire du mail n'est pas pré-rempli via le partage Android (limitation de la Web Share API) : il est copié dans le presse-papiers, à coller dans Gmail.
- Un seul profil de bailleur.
- Les quittances anciennes sont régénérées à la demande à partir des données enregistrées (et de la signature en vigueur au moment de leur création).
