# 📘 Guide de Déploiement RSS Aggregator - Mode Dual

## 🎯 Vue d'ensemble

Ce système supporte **deux modes de déploiement** :
- **Mode Local** : SQLite, parfait pour développement et tests longue durée
- **Mode Cloud** : PostgreSQL sur Render, pour production

---

## 🏠 Mode Local (Développement)

### Prérequis
- Node.js >= 18
- npm >= 9
- 500 MB d'espace disque

### Installation Rapide

```bash
# 1. Cloner le projet
git clone <votre-repo>
cd rss-aggregator

# 2. Installer les dépendances
npm install

# 3. Installer sqlite3 (pour mode local)
npm install sqlite3

# 4. Configuration automatique
npm run setup-local

# 5. Démarrer en mode local
npm run local
```

### Configuration Manuelle

Créez `.env.local` :

```env
NODE_ENV=development
SQLITE_DB=./data/rss_aggregator.db
LOG_LEVEL=debug
ADMIN_TOKEN=votre_token_admin

# Services externes (optionnels)
# FLASK_API_URL=http://localhost:5000
# BAYESIAN_SERVICE_URL=http://localhost:5001
```

### Démarrage

**Linux/Mac:**
```bash
./start-local.sh
```

**Windows:**
```cmd
start-local.bat
```

**Ou via npm:**
```bash
npm run local
```

L'application sera accessible sur : **http://localhost:3000**

### Structure des Données Locales

```
rss-aggregator/
├── data/
│   └── rss_aggregator.db    # Base SQLite
├── logs/
│   └── app.log              # Logs détaillés
└── public/
    └── ...                  # Fichiers statiques
```

### Avantages du Mode Local

✅ **Tests longue durée** sans limite de temps  
✅ **Pas de connexion internet** requise  
✅ **Données persistantes** sur votre machine  
✅ **Debugging facile** avec logs détaillés  
✅ **Pas de coûts** d'hébergement  

---

## ☁️ Mode Cloud (Render)

### Prérequis
- Compte Render.com (gratuit)
- Compte GitHub
- PostgreSQL database sur Render

### Étape 1 : Préparation du Repository

```bash
# Créer .gitignore si nécessaire
cat > .gitignore << EOF
node_modules/
.env
.env.local
data/
logs/
*.db
*.log
EOF

# Commit et push
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Étape 2 : Créer la Base PostgreSQL

1. Aller sur [Render.com](https://render.com)
2. Créer une nouvelle **PostgreSQL Database**
3. Nom : `rss-aggregator-db`
4. Plan : Free
5. Noter l'**Internal Database URL**

### Étape 3 : Créer le Web Service

1. Nouveau **Web Service**
2. Connecter votre repository GitHub
3. Configuration :

```yaml
Name: rss-aggregator
Environment: Node
Build Command: npm install
Start Command: npm start
Plan: Free
```

### Étape 4 : Variables d'Environnement

Dans Render Dashboard → Environment :

```env
NODE_ENV=production
DATABASE_URL=<votre_internal_database_url>
PORT=3000
LOG_LEVEL=info
ADMIN_TOKEN=<générer_token_sécurisé>

# Services Python (optionnels)
FLASK_API_URL=<url_service_flask>
BAYESIAN_SERVICE_URL=<url_service_bayesian>
BAYES_TRIGGER_TOKEN=<token_bayesian>

# Email (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<votre_email>
SMTP_PASS=<mot_de_passe_app>
SMTP_SECURE=false
```

### Étape 5 : Déployer

1. Cliquer sur **"Create Web Service"**
2. Attendre le build (~5 minutes)
3. Vérifier le déploiement :
   - URL : `https://votre-app.onrender.com`
   - Health : `https://votre-app.onrender.com/api/health`

### Limitations Plan Gratuit Render

⚠️ **Importantes à connaître :**

- **Sleep automatique** après 15 min d'inactivité
- **Réveil lent** (~30-60 secondes) au premier accès
- **750h/mois** de temps actif
- **Connexions DB limitées** (max 5 avec config fournie)
- **CPU/RAM limités** (0.1 CPU, 512 MB)

### Optimisations pour Plan Gratuit

Le code fourni inclut déjà :

```javascript
// Dans config.js
rss: {
  maxFeedsPerRefresh: IS_RENDER ? 10 : 20,  // Moins de flux sur Render
  maxArticlesPerFeed: IS_RENDER ? 20 : 50,  // Moins d'articles par flux
  timeout: IS_RENDER ? 15000 : 10000        // Timeout adapté
}

database: {
  postgresql: {
    max: IS_RENDER ? 5 : 10,                // Connexions limitées
    connectionTimeoutMillis: 10000
  }
}
```

---

## 🔄 Migration Local → Cloud

### Exporter les Données Locales

```bash
# Via l'interface web
1. Aller sur http://localhost:3000
2. Onglet "Articles"
3. Cliquer "📊 Exporter CSV"

# Ou via SQLite
sqlite3 data/rss_aggregator.db .dump > backup.sql
```

### Importer dans PostgreSQL Cloud

```bash
# Convertir SQLite → PostgreSQL (manuel)
# Puis via psql:
psql $DATABASE_URL < backup_postgres.sql
```

---

## 🔄 Migration Cloud → Local

### Télécharger depuis Render

```bash
# Exporter via l'interface web puis importer
# Ou via pg_dump si accès direct
```

---

## 🐛 Résolution des Problèmes

### Problème : Boutons ne fonctionnent pas

**Symptômes :**
- Clics sans effet
- Erreurs 404 dans console
- Messages "Route non trouvée"

**Solutions :**

1. **Vérifier la console navigateur** (F12) :
```javascript
// Devrait afficher :
✅ app.js chargé
📡 GET /api/health
```

2. **Vérifier les logs serveur** :
```bash
# Local
tail -f logs/app.log

# Render
Voir les logs dans Dashboard
```

3. **Tester les routes API** :
```bash
# Health check
curl https://votre-app.onrender.com/api/health

# Articles
curl https://votre-app.onrender.com/api/articles?limit=10
```

### Problème : Erreurs silencieuses

**Corrections apportées :**

- ✅ Timeout de 30s sur toutes les requêtes
- ✅ Gestion d'erreurs dans `apiCall()`
- ✅ Messages d'erreur détaillés
- ✅ Logs console systématiques
- ✅ Fallback sur erreurs

### Problème : Base de données déconnectée

**Local (SQLite) :**
```bash
# Vérifier le fichier existe
ls -lh data/rss_aggregator.db

# Tester la connexion
sqlite3 data/rss_aggregator.db "SELECT COUNT(*) FROM articles;"
```

**Cloud (PostgreSQL) :**
```bash
# Tester depuis Render Shell
psql $DATABASE_URL -c "SELECT NOW();"
```

### Problème : Services Python indisponibles

**Configuration actuelle :**
- Services Python **optionnels**
- Système fonctionne sans Flask/Bayesian
- Désactiver dans config si non utilisés :

```env
# Ne pas définir ces variables si services absents
# FLASK_API_URL=
# BAYESIAN_SERVICE_URL=
```

### Problème : Render sleep mode

**Solutions :**

1. **Utiliser un ping externe** (UptimeRobot, cron-job.org)
2. **Passer au plan payant** ($7/mois)
3. **Accepter le délai** de réveil (~60s)

---

## 📊 Monitoring et Maintenance

### Vérification de Santé

```bash
# Local
curl http://localhost:3000/api/health

# Cloud
curl https://votre-app.onrender.com/api/health
```

**Réponse attendue :**
```json
{
  "ok": true,
  "service": "Node.js RSS Aggregator",
  "mode": "local" | "cloud",
  "database": "sqlite" | "postgresql",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### Logs

**Local :**
```bash
# Temps réel
tail -f logs/app.log

# Rechercher erreurs
grep "❌" logs/app.log
```

**Cloud (Render) :**
- Dashboard → Logs
- Recherche par mot-clé
- Téléchargement des logs

### Statistiques

Interface web → Onglet "📊 Métriques" :
- Nombre d'articles
- Flux actifs
- Distribution sentiment
- Thèmes populaires

---

## 🔐 Sécurité

### Tokens et Clés

**Générer un token sécurisé :**
```bash
# Linux/Mac
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Variables Sensibles

⚠️ **Ne jamais commiter :**
- `.env`
- `.env.local`
- Fichiers contenant des tokens/mots de passe

✅ **Toujours ajouter à `.gitignore` :**
```gitignore
.env*
!.env.example
*.db
logs/
data/
```

### Rate Limiting

Le code inclut des délais entre requêtes RSS :
```javascript
// 1 seconde entre chaque flux
await new Promise(resolve => setTimeout(resolve, 1000));
```

---

## 🚀 Optimisations Performances

### Mode Local

```javascript
// config.js
rss: {
  maxFeedsPerRefresh: 20,      // Plus de flux possibles
  maxArticlesPerFeed: 50,      // Plus d'articles par flux
  refreshInterval: 300000      // Refresh toutes les 5 min
}
```

### Mode Cloud

```javascript
// Déjà optimisé dans config.js
rss: {
  maxFeedsPerRefresh: 10,      // Limité pour économiser CPU
  maxArticlesPerFeed: 20,      // Limité pour économiser mémoire
  refreshInterval: 3600000     // Refresh toutes les heures
}
```

---

## 📞 Support

### Problèmes Courants

| Problème | Solution |
|----------|----------|
| 404 sur routes API | Vérifier `server.js` démarré |
| Boutons inactifs | Vérifier console (F12) |
| DB non connectée | Vérifier `DATABASE_URL` ou `SQLITE_DB` |
| Timeout requests | Augmenter timeout dans config |
| Erreurs CORS | Vérifier `config.cors.origins` |

### Ressources

- **Documentation Render** : https://render.com/docs
- **PostgreSQL Guide** : https://www.postgresql.org/docs/
- **SQLite Docs** : https://www.sqlite.org/docs.html
- **Node.js Best Practices** : https://github.com/goldbergyoni/nodebestpractices

### Contact

Pour questions spécifiques :
- Email : ohenri.b@gmail.com
- Issues GitHub : (lien de votre repo)

---

## 📝 Checklist de Déploiement

### Avant Déploiement

- [ ] Tests locaux réussis
- [ ] Variables d'environnement configurées
- [ ] `.gitignore` à jour
- [ ] Dépendances à jour (`npm audit fix`)
- [ ] Logs vérifiés
- [ ] Backup de la DB locale

### Après Déploiement

- [ ] Health check OK
- [ ] Routes API testées
- [ ] Interface web fonctionnelle
- [ ] Refresh RSS fonctionne
- [ ] Thèmes chargés
- [ ] Flux configurés
- [ ] Monitoring activé

---

## 🎓 Commandes Utiles

```bash
# Développement local
npm run dev          # Avec auto-reload (nodemon)
npm run local        # Mode local standard
npm run setup-local  # Configuration initiale

# Production
npm start            # Démarrage standard
npm run prod         # Explicitement en prod

# Tests
npm test             # Health check
curl localhost:3000/api/health

# Base de données
# SQLite
sqlite3 data/rss_aggregator.db
.tables
SELECT COUNT(*) FROM articles;

# PostgreSQL
psql $DATABASE_URL
\dt
SELECT COUNT(*) FROM articles;

# Logs
tail -f logs/app.log              # Local
grep "ERROR" logs/app.log         # Recherche erreurs

# Backup
# SQLite
sqlite3 data/rss_aggregator.db .dump > backup.sql

# PostgreSQL
pg_dump $DATABASE_URL > backup.sql
```

---

## 🏁 Conclusion

Ce système est conçu pour **flexibilité maximale** :

✅ **Développement local** : Tests illimités, debugging facile  
✅ **Production cloud** : Accessible partout, scalable  
✅ **Migration facile** : Local ↔ Cloud en quelques commandes  
✅ **Code robuste** : Gestion d'erreurs complète  

Bon déploiement ! 🚀