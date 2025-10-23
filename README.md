# Agrégateur RSS Thématique avec IA

Système complet d'analyse de flux RSS avec intégration IA pour la correction des scores de sentiment et génération de rapports.
Evolution => Systeme complet d'analyse locale, fonctions bayesienne, corroborations et analyse fine v.2.1 du Deeplearning + Utilisation fonctionnelle
de llama.cpp, pour modeles gguf locaux (en cours de developpement avec phi2_Q4_k_m.gguf)

## 🚀 Fonctionnalités

### Analyse de Base
- 📊 Agrégation de flux RSS multiples ("inconscient mediatique") + Agrégation de flux de commentaires par scrapping de medias sociaux ("inconscient populaire" en dev.)
- 🎨 Thèmes personnalisables avec couleurs => + Configuration multi-langues native
- 📈 Analyse de tendances temporelles => + systeme predictif base sur des algorithmes configurables (en dev.)
- 😊 Analyse de sentiment automatique
- 🔍 Détection d'ironie et de contexte
- 🚀 Systeme d'alerte configurable
- 🌐 generation automatique configurable de rapports reguliers par mail
- 🚀 l'EVO8 est dual PostGreSQL/sqlite3, pour un deploiement sur serveur local ou cloud

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
- mail Gmail pour les rapports automatiques

### Installation des dépendances

**Backend Node.js:**
```bash
npm install

## EVO8NEXTGEN Updates ========>

- Corroboration module (rapidfuzz)
- Bayesian fusion and improved confidence calculation
- Frontend adjusted to use `confidence` and display `bayesian_posterior`
- Tests added in `Scripts/`
