# Agrégateur RSS Thématique avec IA v.5.*

Système complet d'analyse de flux RSS avec intégration IA pour la correction des scores de sentiment et génération de rapports.

## 🚀 Fonctionnalités

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


MAJ 28/10
===========


## 🎯 Gestion des Thèmes - IMPORTANT

### Problème Résolu :
- Les thèmes avaient des IDs NULL empêchant la suppression
- Structure de table corrompue dans SQLite

### Solution Implémentée :
- Schéma SQLite corrigé avec `INTEGER PRIMARY KEY AUTOINCREMENT`
- Script de reconstruction de base de données
- Routes API robustes pour la gestion des thèmes

### Si vous rencontrez des problèmes :
```bash
cd db
node rebuild-database.js
