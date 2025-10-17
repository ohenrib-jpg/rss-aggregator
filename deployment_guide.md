# 📋 Guide de Déploiement - RSS Aggregator v2.3

## 🎯 Architecture Hybride

```
┌─────────────────────────────────────────────────┐
│  FRONTEND (Interface UI Complète)              │
│  • index.html (avec modules IA)                │
│  • app.js (routes /api/* + zoom graphiques)    │
│  • chart-manager.js                            │
│  • style.css                                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  NODE.JS (server.js) - Port 3000               │
│  https://rss-aggregator-l7qj.onrender.com      │
│  • Sert le frontend                            │
│  • Gère les flux RSS (parsing + refresh)       │
│  • Analyse sentiment locale (rapide)           │
│  • Routes: /api/articles, /api/feeds, /themes  │
│  • PROXY vers Flask pour analyse avancée       │
└────────────┬────────────────────────────────────┘
             │ Appelle via axios
             ▼
┌─────────────────────────────────────────────────┐
│  FLASK IA (app.py) - Port 5000                 │
│  https://rss-aggregator-2.onrender.com         │
│  • Analyse bayésienne (analysis_utils.py)      │
│  • Corroboration multi-sources                 │
│  • Métriques avancées (metrics.py)             │
│  • Analyse géopolitique                        │
│  • Routes: /api/analyze, /api/metrics, etc.    │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  POSTGRESQL (Render)                           │
│  • articles, themes, feeds                     │
│  • analyses (résultats IA)                     │
│  • sentiment_lexicon                           │
└─────────────────────────────────────────────────┘
```

---

## 📁 Structure des Fichiers

```
/votre-projet/
├── 📄 server.js              ← Serveur Node.js principal (PROXY)
├── 📄 app.py                 ← Serveur Flask IA (modules Python)
├── 📄 package.json
├── 📄 requirements.txt
├── 📄 start_ia_service.sh    ← Script de démarrage Flask
├── 📄 config.json            ← Flux RSS
├── 📄 themes.json            ← Thèmes
│
├── 📁 db/
│   └── database.js           ← Configuration PostgreSQL
│
├── 📁 modules/               ← Modules Python IA
│   ├── db_manager.py         ← Gestion base de données
│   ├── storage_manager.py    ← Stockage analyses
│   ├── analysis_utils.py     ← Analyse bayésienne
│   ├── corroboration.py      ← Vérification croisée
│   ├── metrics.py            ← Calculs métriques
│   ├── feed_scraper.py       ← Parsing flux RSS
│   └── scheduler.py          ← Tâches planifiées
│
└── 📁 public/                ← Frontend
    ├── index.html            ← Interface UI complète
    ├── app.js                ← Client JavaScript (avec zoom)
    ├── chart-manager.js      ← Gestionnaire graphiques
    └── style.css             ← Styles
```

---

## 🚀 Déploiement sur Render

### Service 1 : Node.js (Principal)

**Configuration :**
- **Name:** `rss-aggregator`
- **Environment:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Port:** `3000` (auto-détecté)

**Variables d'environnement :**
```bash
DATABASE_URL=postgresql://rssaggregator_postgresql_olivier_user:...@dpg-d3nnodm3jp1c73c3302g-a.frankfurt-postgres.render.com/rssaggregator_postgresql_olivier
PORT=3000
NODE_ENV=production
FLASK_API_URL=https://rss-aggregator-2.onrender.com
```

**package.json :**
```json
{
  "name": "rss-aggregator",
  "version": "2.3.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "rss-parser": "^3.13.0",
    "pg": "^8.11.3",
    "axios": "^1.6.0"
  }
}
```

---

### Service 2 : Flask IA

**Configuration :**
- **Name:** `rss-aggregator-ia`
- **Environment:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `python app.py`
- **Port:** `5000` (auto-détecté)

**Variables d'environnement :**
```bash
DATABASE_URL=postgresql://rssaggregator_postgresql_olivier_user:...@dpg-d3nnodm3jp1c73c3302g-a.frankfurt-postgres.render.com/rssaggregator_postgresql_olivier
PORT=5000
FLASK_DEBUG=0
LOG_LEVEL=INFO
```

**requirements.txt :**
```txt
Flask==3.0.0
Flask-CORS==4.0.0
psycopg2-binary==2.9.9
rapidfuzz==3.5.2
feedparser==6.0.11
requests==2.31.0
```

---

## ✅ Checklist de Vérification

### Après déploiement Node.js :

- [ ] `https://rss-aggregator-l7qj.onrender.com/` → Affiche l'interface
- [ ] `https://rss-aggregator-l7qj.onrender.com/health` → `{"status": "OK", "flask": "connected"}`
- [ ] `https://rss-aggregator-l7qj.onrender.com/api/articles` → Liste des articles
- [ ] `https://rss-aggregator-l7qj.onrender.com/api/themes` → Liste des thèmes
- [ ] `https://rss-aggregator-l7qj.onrender.com/api/feeds` → Liste des flux RSS

### Après déploiement Flask :

- [ ] `https://rss-aggregator-2.onrender.com/` → Info du service IA
- [ ] `https://rss-aggregator-2.onrender.com/api/health` → `{"ok": true, "service": "Flask IA"}`
- [ ] `https://rss-aggregator-2.onrender.com/api/metrics` → Métriques IA
- [ ] `https://rss-aggregator-2.onrender.com/api/sentiment/stats` → Stats sentiment
- [ ] `https://rss-aggregator-2.onrender.com/api/learning-stats` → Stats apprentissage

### Tests d'intégration :

- [ ] Interface : Bouton "Actualiser" fonctionne
- [ ] Onglet "Métriques" charge les données
- [ ] Onglet "Géopolitique" affiche le rapport IA
- [ ] Onglet "Apprentissage" montre les stats
- [ ] Graphiques : Zoom molette + Pan drag fonctionnent
- [ ] Export JSON/CSV fonctionnent
- [ ] Paramètres sauvegardés dans localStorage

---

## 🔧 Configuration PostgreSQL

**Tables requises :**

```sql
-- Articles
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  link TEXT UNIQUE NOT NULL,
  pub_date TIMESTAMP,
  feed_url TEXT,
  sentiment_score FLOAT DEFAULT 0,
  sentiment_type VARCHAR(20) DEFAULT 'neutral',
  sentiment_confidence FLOAT DEFAULT 0,
  ia_corrected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Thèmes
CREATE TABLE themes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  keywords TEXT[],
  color VARCHAR(20),
  description TEXT
);

-- Flux RSS
CREATE TABLE feeds (
  id SERIAL PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_fetched TIMESTAMP
);

-- Analyses IA
CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  title TEXT,
  source TEXT,
  date TIMESTAMP,
  summary TEXT,
  confidence DOUBLE PRECISION,
  corroboration_count INT,
  corroboration_strength DOUBLE PRECISION,
  bayesian_posterior DOUBLE PRECISION,
  raw JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lexique sentiment
CREATE TABLE sentiment_lexicon (
  id SERIAL PRIMARY KEY,
  word VARCHAR(255) UNIQUE NOT NULL,
  score FLOAT NOT NULL,
  usage_count INT DEFAULT 0,
  total_score FLOAT DEFAULT 0,
  consistency FLOAT DEFAULT 0.5,
  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relations thèmes-articles
CREATE TABLE theme_analyses (
  id SERIAL PRIMARY KEY,
  article_id INT REFERENCES articles(id),
  theme_id INT REFERENCES themes(id)
);
```

---

## 🎨 Fonctionnalités de l'Interface

### Modules IA Actifs (visibles en haut)
- ✅ Analyse Bayésienne (fusion probabiliste)
- ✅ Corroboration (vérification croisée)
- ✅ Analyse Sentiment (détection émotions)
- ✅ Géopolitique (zones de crise + relations)
- ✅ Métriques IA (calculs avancés)

### Onglets Disponibles
1. **📈 Analyse** : Graphiques thèmes + timeline (zoom/pan)
2. **📊 Tendances** : Évolution des thèmes
3. **🎯 Métriques** : Stats globales + sentiment + top thèmes
4. **😊 Sentiment** : Aperçu positif/neutre/négatif
5. **🌍 Géopolitique** : Rapport + zones de crise + relations
6. **🧠 Apprentissage** : Stats IA + modules actifs
7. **📰 Flux RSS** : Gestion des flux (ajout/suppression)
8. **🎨 Thèmes** : Gestion des thèmes (ajout/édition)
9. **📄 Articles** : Liste complète avec sentiment

### Fonctionnalités Graphiques
- **🖱️ Zoom molette** : Zoomer/dézoomer sur les graphiques
- **🖱️ Pan drag** : Déplacer la vue
- **🔍 Reset Zoom** : Boutons pour réinitialiser
- **📊 Périodes** : 30/60/90 jours sélectionnables

### Paramètres Configurables
- ⏱️ Intervalle de rafraîchissement (1-60 min)
- 📅 Période d'analyse par défaut (7-90 jours)
- 🎯 Seuil de confiance minimum (0-1)
- 🔗 Seuil de corroboration (0-1)

### Exports Disponibles
- 📥 **Export JSON** : Données complètes avec métriques
- 📥 **Export CSV** : Articles avec sentiment + thèmes
- 📊 **Stats IA** : Modal avec statistiques détaillées

---

## 🐛 Résolution de Problèmes

### Erreur 404 sur /api/*
**Cause :** Routes manquantes ou préfixe incorrect  
**Solution :** Vérifier que toutes les routes commencent par `/api/` dans server.js et app.py

### Flask non accessible depuis Node
**Cause :** Variable `FLASK_API_URL` manquante  
**Solution :** Ajouter `FLASK_API_URL=https://rss-aggregator-2.onrender.com` dans les variables d'environnement de Render

### Graphiques ne s'affichent pas
**Cause :** Chart.js ou plugin zoom non chargé  
**Solution :** Vérifier que les scripts CDN sont présents dans index.html :
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1"></script>
```

### Données ne se chargent pas
**Cause :** PostgreSQL non accessible  
**Solution :** Vérifier `DATABASE_URL` et tester la connexion avec :
```bash
psql postgresql://rssaggregator_postgresql_olivier_user:...
```

### Modules Python manquants
**Cause :** Structure de dossiers incorrecte  
**Solution :** S'assurer que le dossier `modules/` contient tous les fichiers .py

---

## 📊 Monitoring

### Logs à surveiller

**Node.js :**
```
✅ Base de données initialisée
🚀 Serveur démarré sur le port 3000
🔗 Proxy Flask: GET /api/metrics
📥 Récupération: https://...
✅ 10 articles de Le Monde
```

**Flask :**
```
✅ Flask IA Service - DB initialisée: OK
🔬 Analyse IA: Article title...
✅ Analyse terminée: conf=0.85, corr=0.72, post=0.88
📊 Calcul métriques IA sur 30 jours
```

### Métriques clés

- **Total articles** : Doit augmenter régulièrement
- **Confiance moyenne** : Idéalement > 0.70
- **Fiabilité bayésienne** : Idéalement > 0.75
- **Corroboration moyenne** : Idéalement > 0.60

---

## 🎯 Prochaines Améliorations

- [ ] Authentification utilisateur
- [ ] Notifications push
- [ ] API publique avec clés
- [ ] Dashboard temps réel avec WebSocket
- [ ] Export PDF des rapports
- [ ] Intégration OpenAI pour résumés
- [ ] Analyse des images d'articles
- [ ] Détection de fake news
- [ ] Prédiction de tendances

---

## 📞 Support

**En cas de problème :**
1. Vérifier les logs Render (Node + Flask)
2. Tester les endpoints `/health` des 2 services
3. Vérifier la connexion PostgreSQL
4. Consulter la console navigateur (F12)

**Architecture conçue par :** Claude (Anthropic)  
**Développée pour :** Olivier Henri B.  
**Version :** 2.3  
**Date :** Octobre 2025
