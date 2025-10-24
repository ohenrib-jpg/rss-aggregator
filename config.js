// config.js - Configuration centralisée pour mode dual (local/cloud)

const ENV = process.env.NODE_ENV || 'production';
const IS_RENDER = !!process.env.RENDER;
const IS_LOCAL = !IS_RENDER && ENV === 'development';

const config = {
  // Environnement
  env: ENV,
  isRender: IS_RENDER,
  isLocal: IS_LOCAL,
  
  // Port
  port: parseInt(process.env.PORT) || 3000,
  
  // Base de données
  database: {
    // Mode dual : PostgreSQL sur Render, SQLite en local
    use: process.env.DATABASE_URL ? 'postgresql' : 'sqlite',
    
    // PostgreSQL (Render/Cloud)
    postgresql: {
      connectionString: process.env.DATABASE_URL,
      ssl: IS_RENDER ? { rejectUnauthorized: false } : false,
      max: IS_RENDER ? 5 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: IS_RENDER ? 10000 : 5000
    },
    
    // SQLite (Local)
    sqlite: {
      filename: process.env.SQLITE_DB || './data/rss_aggregator.db',
      options: {
        verbose: IS_LOCAL
      }
    }
  },
  
  // Services externes
  services: {
    flask: {
      enabled: !!process.env.FLASK_API_URL || true,
      url: process.env.FLASK_API_URL || 'http://localhost:5000',
      timeout: IS_RENDER ? 25000 : 10000
    },
    
    bayesian: {
      enabled: !!process.env.BAYESIAN_SERVICE_URL,
      url: process.env.BAYESIAN_SERVICE_URL || 'http://localhost:5001',
      token: process.env.BAYES_TRIGGER_TOKEN || 'dev_token_local',
      timeout: IS_RENDER ? 25000 : 10000
    }
  },
  
  // RSS Parser
  rss: {
    timeout: IS_RENDER ? 15000 : 10000,
    maxRedirects: 5,
    maxFeedsPerRefresh: IS_RENDER ? 10 : 20,
    maxArticlesPerFeed: IS_RENDER ? 20 : 50,
    refreshInterval: IS_RENDER ? 3600000 : 300000 // 1h cloud, 5min local
  },
  
  // Email
  email: {
    enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (IS_LOCAL ? 'debug' : 'info'),
    console: true,
    file: IS_LOCAL ? './logs/app.log' : null
  },
  
  // CORS
  cors: {
    origins: IS_LOCAL 
      ? ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000']
      : [
          'https://rss-aggregator-l7qj.onrender.com',
          process.env.RENDER_EXTERNAL_URL
        ].filter(Boolean)
  },
  
  // Sécurité
  security: {
    adminToken: process.env.ADMIN_TOKEN || 'dev_admin_token_change_me'
  }
};

// Affichage configuration au démarrage
function displayConfig() {
  console.log('\n' + '='.repeat(70));
  console.log('📋 CONFIGURATION RSS AGGREGATOR');
  console.log('='.repeat(70));
  console.log(`🌍 Environnement: ${config.env.toUpperCase()}`);
  console.log(`📍 Mode: ${config.isRender ? 'CLOUD (Render)' : 'LOCAL'}`);
  console.log(`🔌 Port: ${config.port}`);
  console.log(`🗄️  Database: ${config.database.use.toUpperCase()}`);
  console.log(`🤖 Flask API: ${config.services.flask.enabled ? 'ENABLED' : 'DISABLED'} (${config.services.flask.url})`);
  console.log(`🧮 Bayesian: ${config.services.bayesian.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`✉️  Email: ${config.email.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📰 Max feeds/refresh: ${config.rss.maxFeedsPerRefresh}`);
  console.log('='.repeat(70) + '\n');
}

module.exports = { config, displayConfig };
