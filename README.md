# Quittances de loyer

Application web installable (PWA) pour générer des quittances de loyer en PDF et les envoyer depuis Android via Gmail, déclinée aussi en application Android native (dossier `android/`) qui ouvre Gmail avec le destinataire et le PDF déjà en place. Usage strictement personnel, aucun serveur : toutes les données restent sur le téléphone.

## Fonctions

- Écran « Ce mois » : à l'ouverture, l'app résume le mois courant (quittances à faire, montant, locataires) et propose un seul bouton « Générer et envoyer ». Quand tout est envoyé, elle le dit et n'a plus rien à demander. « Vérifier avant » ouvre le détail pour ajuster.
- Locataires : civilité, nom, prénom, email, adresse du bien, loyer hors charges, charges, jour de paiement habituel (pré-remplit la date de paiement de chaque mois, borné à la fin du mois).
- Sauvegarde locale : export / import d'un fichier JSON, effacement complet.
- Bailleur : identité, adresse, ville de signature.
- Signature électronique dessinée au doigt ou importée depuis une image (fond blanc rendu transparent).
- Quittance PDF A4 conforme au modèle usuel (montant en chiffres et en lettres, période, détail loyer / charges, date de paiement, mentions de la loi du 6 juillet 1989).
- Numérotation automatique `AAAA-MM-NNN` (mois de la période + séquence).
- Quittances en lot : onglet Quittance → « Tous les locataires » → un mois, les dates communes, et la liste des locataires à cocher (montants enregistrés sur chaque locataire ; ceux qui ont déjà une quittance sur la période sont décochés et signalés). Génère toutes les quittances d'un coup et ouvre la file d'envoi.
- File d'envoi : les quittances s'envoient l'une après l'autre (« Envoyer la suivante »), chacune passe en « Envoyée » après le partage. Bouton « Tout en un seul PDF » pour un PDF multi-pages (impression, archivage).
- Suivi d'envoi : chaque quittance est marquée « Envoyée le … » ou « Non envoyée » dans l'historique, modifiable à la main. Un bouton « Envoyer les N quittances non envoyées » rouvre la file d'envoi pour ce qui reste.
- Historique des quittances : réouverture, renvoi, suppression, détection des doublons.
- Envoi : bouton « Envoyer » → menu de partage Android → Gmail s'ouvre avec le PDF joint, l'objet et le message pré-remplis. L'adresse email du locataire est copiée dans le presse-papiers (le partage Android ne permet pas de pré-remplir le destinataire) ; le toast qui suit propose « Recopier » si besoin.
- Email prêt à envoyer (.eml) : télécharge un brouillon complet — destinataire, objet, message, PDF joint, marqué `X-Unsent` — à ouvrir dans un client mail d'ordinateur (Outlook, Thunderbird…). C'est aussi le mode de repli quand le partage n'est pas disponible.
- Application Android (APK) : même interface, mais « Envoyer » ouvre Gmail avec le destinataire, l'objet, le message **et** le PDF déjà en place ; il ne reste qu'à appuyer sur Envoyer dans Gmail. Elle ajoute un rappel mensuel (notification le 10 à 9 h par défaut, réglable, silencieux si le mois est déjà terminé) et une sauvegarde automatique dans `Documents/Quittances/`. Voir « Application Android ».
- Mode sombre automatique, selon le réglage du téléphone (PWA comme application Android).
- Hors ligne : l'app fonctionne sans réseau une fois installée.

## Installation sur Android

L'app est en ligne sur `https://ghermin.github.io/la-quittance/` (GitHub Pages, branche `main`).

1. Ouvre l'URL dans Chrome.
2. Menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran d'accueil »). Un bouton « Installer » apparaît aussi dans l'onglet Réglages de l'app.
3. Lance l'app depuis l'icône : elle s'ouvre en plein écran, sans barre d'adresse.

## Premier usage

1. Réglages → renseigne le bailleur, signe dans la zone puis « Enregistrer la signature ». Ajuste le modèle d'email si besoin.
2. Locataires → ajoute chaque locataire avec l'adresse du bien, le loyer et les charges.
3. Quittance → choisis le locataire et le mois, vérifie les montants, « Générer la quittance », puis « Envoyer ». Avec plusieurs locataires, « Tous les locataires » génère les quittances du mois en une fois puis les envoie à la suite.

## Mise à jour de l'app

Pousse les modifications sur `main`. Le service worker sert la version en cache puis récupère la nouvelle en arrière-plan : la mise à jour est visible à l'ouverture suivante de l'app. Pour forcer le renouvellement du cache, incrémente `CACHE` dans `sw.js`.

## Données et sauvegarde

Les données sont stockées dans le `localStorage` du navigateur, sous la clé `quittance-loyer.v1`. Effacer les données de navigation de Chrome pour ce site, ou désinstaller l'app, les supprime.

Réglages → Données :

- **Exporter une sauvegarde** : dépose un fichier `quittances-sauvegarde-AAAA-MM-JJ.json` dans les téléchargements du téléphone (locataires, bailleur, signature, historique, modèle d'email). À conserver ailleurs (Drive, mail à soi-même…).
- **Importer une sauvegarde** : choisit un fichier JSON exporté par l'app et remplace toutes les données actuelles après confirmation. Fonctionne aussi pour changer de téléphone.
- **Tout effacer** : remet l'app à zéro après confirmation.

Chaque élément se supprime aussi individuellement : locataire, quittance de l'historique, signature.

## Application Android

Le navigateur ne permet pas d'ouvrir Gmail avec à la fois le destinataire et une pièce jointe. L'application Android lève cette limite : c'est la même interface web, embarquée dans une petite application (WebView) avec un pont natif qui ouvre Gmail directement avec destinataire, objet, message et PDF. Aucun compte à connecter, aucune permission Internet : l'app ne parle qu'à Gmail sur le téléphone.

### Installer

1. Depuis le téléphone, Réglages de la PWA → « Télécharger l'application Android (APK) », ou directement <https://ghermin.github.io/la-quittance/dist/la-quittance.apk>. L'APK signé est versionné dans `dist/` : pour publier une nouvelle version, reconstruire (`assembleRelease`), copier `app-release.apk` vers `dist/la-quittance.apk` et pousser.
2. Ouvrir le fichier téléchargé. À la première fois, Android demande d'autoriser Chrome à installer des applications : accepter, puis reprendre l'installation.
3. Les données ne passent pas toutes seules de la PWA à l'application : Réglages → « Exporter une sauvegarde » dans la PWA, puis « Importer une sauvegarde » dans l'application.

Mise à jour : télécharger le nouvel APK et l'ouvrir. Tant que la même clé de signature est utilisée, l'installation se fait par-dessus et les données sont conservées.

### Ce qui change par rapport à la PWA

- « Envoyer » ouvre Gmail (ou le sélecteur d'applications si Gmail est absent) avec tout pré-rempli, puis marque la quittance envoyée.
- « PDF » ouvre le fichier dans le lecteur PDF du téléphone ; « Télécharger », « .eml », « Tout en un seul PDF » et la sauvegarde JSON vont dans le dossier Téléchargements.
- Rappel mensuel : Réglages → « Rappel mensuel ». Activé par défaut le 10 à 9 h (Android demande l'autorisation des notifications au premier lancement). La notification n'est pas envoyée si toutes les quittances du mois sont déjà envoyées. L'alarme est reprogrammée après un redémarrage ou une mise à jour de l'app.
- Sauvegarde automatique : à chaque modification, l'app réécrit `Documents/Quittances/quittances-sauvegarde.json`. Ce fichier s'importe avec « Importer une sauvegarde », y compris après une réinstallation.
- Le bouton Retour ferme la fenêtre ouverte, puis revient à l'onglet Quittance, puis quitte.
- Aucune permission Internet : l'app ne parle qu'à Gmail et au stockage du téléphone.

### Construire l'APK

Prérequis : JDK 17 et le SDK Android (`platforms;android-35`, `build-tools;35.0.0`). Le projet Gradle est dans `android/` et embarque les fichiers web du dépôt à la compilation (`index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`).

```powershell
$env:JAVA_HOME = 'C:\chemin\vers\jdk-17'
$env:ANDROID_HOME = 'C:\chemin\vers\sdk'
cd android
.\gradlew.bat assembleDebug      # APK de test : app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat assembleRelease    # APK signé si android\signing.properties est présent
```

Le build release est minifié (R8, réduction des ressources) : l'APK pèse environ 1 Mo. `android/signing.properties` (ignoré par git) contient `QUITTANCE_KEYSTORE`, `QUITTANCE_KEYSTORE_PASSWORD`, `QUITTANCE_KEY_ALIAS`, `QUITTANCE_KEY_PASSWORD`. Le keystore de release doit être conservé précieusement : sans lui, impossible de publier une mise à jour installable par-dessus l'existant. Les icônes se régénèrent avec `powershell -ExecutionPolicy Bypass -File tools/make-android-icons.ps1`.

### Publication automatique (optionnelle)

Le workflow `.github/workflows/android.yml` construit l'APK sur GitHub Actions et, pour un tag `vX.Y.Z`, l'attache à une release GitHub sous le nom `la-quittance.apk` (`https://github.com/Ghermin/la-quittance/releases/latest/download/la-quittance.apk`). Il faut renseigner quatre secrets dans le dépôt (Settings → Secrets and variables → Actions) : `QUITTANCE_KEYSTORE_BASE64` (le fichier `.jks` encodé en base64), `QUITTANCE_KEYSTORE_PASSWORD`, `QUITTANCE_KEY_ALIAS`, `QUITTANCE_KEY_PASSWORD`. Publier une version :

```bash
git tag v1.1.0
git push origin v1.1.0
```

## Développement

- Tests unitaires (logique métier de `js/core.js` et `js/pdf.js` : numérotation, doublons, dates de paiement, état du mois, email, message MIME, sauvegarde, validation) :

  ```bash
  node tools/test.js
  ```

- Génération d'un PDF d'exemple :

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
index.html               Interface (4 onglets : Quittance (ce mois / une / plusieurs), Locataires, Historique, Réglages)
css/app.css              Styles mobile-first, thèmes clair et sombre
js/app.js                Interface : vues, formulaires, file d'envoi, signature, partage, réglages
js/core.js               Logique pure (sans DOM) : état, numérotation, dates, email, message MIME, validation
js/native.js             Pont vers l'application Android (Gmail, fichiers, sauvegarde, rappel)
js/pdf.js                Construction du PDF, montant en lettres, dates en français
js/vendor/jspdf.umd.min.js  jsPDF 2.5.2
manifest.webmanifest     Manifest PWA
sw.js                    Service worker (cache hors ligne)
icons/                   Icônes PWA
tools/                   Tests unitaires, scripts de génération (icônes PWA et Android, PDF d'exemple)
android/                 Application Android (WebView + pont natif Gmail), projet Gradle
dist/la-quittance.apk    APK Android signé, servi par GitHub Pages
.github/workflows/       Construction et publication de l'APK (optionnel)
```

## Limites connues

- Le destinataire du mail n'est pas pré-rempli via le partage Android (limitation de la Web Share API, qui ne transmet pas `EXTRA_EMAIL`) : il est copié dans le presse-papiers, à coller dans Gmail. Le fichier `.eml` contourne la limite mais s'ouvre comme brouillon éditable surtout sur ordinateur ; Gmail Android l'affiche en lecture seule.
- Le partage ne permet d'envoyer qu'une quittance par mail : la file d'envoi enchaîne les envois un par un.
- « Envoyée » est posé quand le partage se termine (l'app cible a été choisie) ou, dans l'application Android, quand Gmail s'ouvre, pas quand le mail est réellement parti : à corriger à la main dans l'historique si besoin.
- L'application Android et la PWA ont chacune leurs données ; le passage de l'une à l'autre se fait par export puis import de la sauvegarde JSON.
- Un seul profil de bailleur.
- Les quittances anciennes sont régénérées à la demande à partir des données enregistrées (et de la signature en vigueur au moment de leur création).
