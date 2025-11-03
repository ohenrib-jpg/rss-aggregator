# Agrégateur RSS Thématique avec IA v.5.* En developpement =>n'utiliser qu'a but d'etude/formation
contact : ohenri.b@gmail.com

Système complet d'analyse de flux RSS (detection de "l'inconscient mediatique") et commentaires reseaux sociaux ("l'inconscient populaire")=> Analyse du facteur_Z (ecart entre discours public, et ressenti populaire). Intégration IA pour la correction des scores de sentiment, l'analyse en temps reel des flux d'informations, les calculs scientifiques (bayesien, corroboration, formule de Shannon, de Pearson), les modules de fonctions a venir (+ quelques gouttes de potion speciale)....et génération de rapports.
MERCI DEEPSEEK ;-)

MAJ 03/11/2025 => jusqu'a suppression de cette MAJ, le dernier repo est dans EVO8NEXTLEVEL => l'amelioration du parsser axios, et la gestion des nouveaux graphiques
sont incompatibles avec certaines fonctions de l'IA gguf (pas moyen de l'utiliser comme debug F12 locale ET comme analyste)
EVO8NEXTLEVEL = repo MAJ pour fonction analytiques + Deeplearning
EVO9 = sera pour le debug avant re-integration IA. 

## 🚀 Fonctionnalités
MAJ 28/10/2025
Les routes "alertes" fonctionnent enfin
Le parsser Axios est parfaitement operationnel avec l'analyse thematique
Reste a resoudre la resilience des flux rss
MAJ 29/10/2025
DEBUT D'INTEGRATION DU DEBOGGEUR IA => PROPOSE DES CORRECTIONS DU CODE EN TEMPS REEL EN CAS D'ERREURS (console ou silencieuses)
Debut de l'integration de la carte interactive des relations internationales et des alertes silencieuses predictives
Pas moyen d'utiliser DeepSeek R1 avec ma petite configuration(ce que je regrette), donc, on se rabat sur Llama 3.2 3B Q4_K_M quantized depuis F16 pour le dev.
MAJ 02/10/2025
IA integree, graphiques chart.js pour chaques flux (mediatiques/sociaux) et integration de "social_prediction.js"
Les routes du frontend doivent etres refaites dans *.html

N'OUBLIEZ PAS D'INSTALLER llama.cpp (et un modele gguf => RAPPEL : utilisez la fonction de quantification du build llama.cpp (apres compil.) pour adapter a votre config.)

### Analyse de Base
- 📊 Agrégation de flux RSS multiples + Parsser reseaux sociaux
- 🎨 Thèmes personnalisables avec couleurs
- 📈 Analyse de tendances temporelles
- 😊 Analyse de sentiment automatique
- 🔍 Détection d'ironie et de contexte
- 📊 Comparaison des ecarts entre "l'inconscient mediatique" et "l'inconscient populaire"
- 📈 Calcul de l'indice_Z => dissonances  

### Module IA Avancé
- 🤖 Correction automatique des scores de sentiment
- 🎯 Détection des faux positifs/négatifs
- 🌐 Vérification contextuelle par scraping
- 📄 Génération de rapports PDF professionnels
- 🔄 Apprentissage automatique
- 🤖 Prediction des points de ruptures (fonction "Pythie", utilisant un filtre de bruits et de signaux faibles "fait-maison"=>pas dispo sur le repo)

## 🛠 Installation

### Prérequis
- Node.js 16+
- Python 3.8+
- Clé API (OpenAI ou équivalent)
- Llama.cpp et modele locale gguf
- Le reste : npm install + requirements.txt

### Installation des dépendances

**Backend Node.js:**
```bash
npm install

## EVO8NEXTLEVEL Updates Dev.
- Corroboration module (rapidfuzz)
- Bayesian fusion and improved confidence calculation
- Big Data analysis (using TF-IDF method, for vectoriel analysis)
- Mahalanobis distance
- Shannon's entropy
- Frontend adjusted to use `confidence` and display `bayesian_posterior`
- Tests added in `Scripts/`
Et repo toujours public : ohenrib-jpg
