# Site Résidence Ballarin B

Site statique Astro, hébergé sur Vercel (gratuit), protégé par un mot de passe unique.

## Développement

```bash
npm install
npm run dev        # http://localhost:4321 (sans mot de passe en local)
npm run build      # génère dist/
```

## Déploiement Vercel (une seule fois)

1. Pousser ce dossier sur un dépôt GitHub (privé).
2. Sur vercel.com → **Add New Project** → importer le dépôt. Framework détecté : Astro. Ne rien changer.
3. **Settings → Environment Variables** :
   - `SITE_PASSWORD` = le mot de passe à donner aux copropriétaires (obligatoire)
   - `SESSION_SECRET` = n'importe quelle chaîne longue au hasard (optionnel, conseillé)
4. Deploy. Ensuite chaque modification poussée sur GitHub redéploie le site automatiquement (~1 min).

Le mot de passe est vérifié par `middleware.js` (Vercel Edge Middleware). Une fois entré, un cookie garde la session un an. `/deconnexion` efface le cookie.

## Mise à jour du contenu — mode d'emploi pour le syndic (aucune ligne de code)

Tout ce qui change régulièrement est dans le dossier **`public/docs/`**, avec des noms de fichiers **fixes** :

| Fichier | Contenu | Quand le remplacer |
|---|---|---|
| `public/docs/paiements.xlsx` | Tableau des règlements de charges (fichier Excel, 1er onglet) — affiché comme un vrai tableau sur le site | Chaque mois |
| `public/docs/paiements.jpg` | Ancienne version image, utilisée seulement si le .xlsx est absent | — |
| `public/docs/ag-derniere.docx` | Compte rendu de la dernière AG (Word) | Après chaque AG |
| `public/docs/archives/ag-AAAA.pdf` ou `.docx` | Anciens comptes rendus | Après chaque AG : y déplacer l'ancien "dernier" |
| `public/docs/carnet-entretien.pdf` | Carnet d'entretien | Rarement |

**Procédure sur GitHub (dans le navigateur, sans rien installer) :**
1. Ouvrir le dépôt → dossier `public/docs`.
2. Bouton **Add file → Upload files**, glisser le nouveau fichier **avec exactement le même nom** (`paiements.xlsx` ou `ag-derniere.docx`). Il remplace l'ancien.
3. Bouton vert **Commit changes**. Vercel republie le site tout seul ; la date "Dernière mise à jour" se met à jour automatiquement.

**Important — fichier des charges** : ne jamais déposer le classeur complet `CORSE_xxxx.xlsm` (il contient adresses, e-mails et comptes bancaires des copropriétaires). Déposer uniquement un petit classeur `paiements.xlsx` avec le bloc Recettes : dans Excel, onglet FINAL.XLS → sélectionner le bloc NOMS / MONTANT / APPEL EXCEP. / INTERNET jusqu'aux totaux → copier → Fichier › Nouveau → coller → Enregistrer sous `paiements.xlsx`. Le site reconnaît automatiquement la 1re ligne d'en-tête et met en évidence les lignes Perçu / Prévu / Total / Dépenses / Avance / Avoir.

Pour ajouter une archive : déposer `ag-2026.docx` (ou `.pdf`) dans `public/docs/archives/` puis ajouter une ligne dans la liste `archives` en haut de `src/pages/assemblees.astro` (c'est la seule retouche "texte" nécessaire).

Les chiffres clés de la page Finances (trésorerie, provisions) sont écrits dans `src/pages/finances.astro` — à mettre à jour une fois par an après l'AG.

## Structure

- `src/layouts/Layout.astro` — entête, menu, pied de page, scripts (parallax, drapeau animé, menu mobile)
- `src/components/Flag.astro` — drapeau corse (canvas, onde tissu)
- `src/pages/` — `index` (accueil), `assemblees`, `charges`, `finances`, `photos`, `infos`, `connexion`
- `src/styles/global.css` — toute la charte (couleurs en variables `:root`)
- `public/images/` — photos de la résidence (optimisées), `flag-corse.svg`
- `public/docs/` — documents remplaçables (voir ci-dessus)
- `middleware.js` — protection par mot de passe

## À compléter

- `src/pages/infos.astro` : remplacer `syndicjcb@ballarinb-tiuccia.fr` par l'e-mail du syndic.
- Vidéo drone : Vimeo 238441516 (mot de passe `ballarindrone`, affiché sur la page Photos).
