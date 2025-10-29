# Agrégateur RSS Thématique avec IA v.5.*

Système complet d'analyse de flux RSS avec intégration IA pour la correction des scores de sentiment et génération de rapports.
MERCI DEEPSEEK ;-)
## 🚀 Fonctionnalités
MAJ 28/10/2025
Les routes "alertes" fonctionent enfin
Le parsser Axios est parfaitement operationnel avec l'analyse thematique
Reste a resoudre la resilience des flux rss
MAJ 29/10/2025
DEBUT D'INTEGRATION DU DEBOGGEUR IA => PROPOSE DES CORRECTIONS DU CODE EN TEMPS REEL EN CAS D'ERREURS (console ou silencieuses)

Pas moyen d'utiliser DeepSeek R1 avec ma petite configuration(ce que je regrette), donc, on se rabat sur Llama 3.2

### Analyse de Base
- 📊 Agrégation de flux RSS multiples + Parsser reseaux sociaux
- 🎨 Thèmes personnalisables avec couleurs
- 📈 Analyse de tendances temporelles
- 😊 Analyse de sentiment automatique
- 🔍 Détection d'ironie et de contexte
- 📊 Comparaison des ecarts entre "l'inconscient mediatique" et "l'inconscient populaire" 

### Module IA Avancé
- 🤖 Correction automatique des scores de sentiment
- 🎯 Détection des faux positifs/négatifs
- 🌐 Vérification contextuelle par scraping
- 📄 Génération de rapports PDF professionnels
- 🔄 Apprentissage automatique

## 🛠 Installation

### Prérequis
- Node.js 16+
- Python 3.8+
- Clé API (OpenAI ou équivalent)

### Installation des dépendances

**Backend Node.js:**
```bash
npm install

## EVO8NEXTLEVEL Updates Dev.
- Corroboration module (rapidfuzz)
- Bayesian fusion and improved confidence calculation
- Frontend adjusted to use `confidence` and display `bayesian_posterior`
- Tests added in `Scripts/`
Et repo toujours public : ohenri-jpg
