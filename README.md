# Agrégateur RSS Thématique avec IA

Système complet d'analyse de flux RSS avec intégration IA pour la correction des scores de sentiment et génération de rapports.

## 🚀 Fonctionnalités

### Analyse de Base
- 📊 Agrégation de flux RSS multiples
- 🎨 Thèmes personnalisables avec couleurs
- 📈 Analyse de tendances temporelles
- 😊 Analyse de sentiment automatique
- 🔍 Détection d'ironie et de contexte

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

## NEXTGEN Updates
- Parquet storage for analyses (data/analyses/*.parquet)
- Corroboration module (rapidfuzz)
- Bayesian fusion and improved confidence calculation
- Frontend adjusted to use `confidence` and display `bayesian_posterior`
- Tests added in `tests/`

EVO3 15/10/2025=>

- **Base de données PostgreSQL** sur Render pour une meilleure performance
- **Stockage relationnel** des articles, thèmes et analyses
- **Requêtes optimisées** pour les grandes quantités de données
- **Sauvegarde automatique** et récupération des données
- **Migration transparente** depuis l'ancien système JSON/Parquet

MAJ 15/10 V3.2

- **Integration PostgreSQL

init db base :
npm run init-db

requirements :
npm install pg dotenv


