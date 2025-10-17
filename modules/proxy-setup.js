// proxy-setup.js
const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const app = express();

// Configuration du proxy pour Flask
const flaskProxy = createProxyMiddleware({
  target: (process.env.FLASK_TARGET || 'http://localhost:5000'), // Port de Flask
  changeOrigin: true,
  secure: false,
  logLevel: (process.env.NODE_ENV==='production'? 'warn':'debug'),
  pathRewrite: {
    '^/api': '/api' // Conserve le chemin /api
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy to Flask failed' });
  }
});

// Routes à proxy vers Flask
const flaskRoutes = [
  '/api/sentiment/stats',
  '/api/geopolitical/report',
  '/api/geopolitical/crisis-zones', 
  '/api/geopolitical/relations',
  '/api/learning-stats',
  '/api/analyze',
  '/api/articles',
  '/api/themes',
  '/api/feeds',
  '/api/summaries',
  '/api/metrics',
  '/api/refresh',
  '/api/health'
];

// Appliquer le proxy aux routes API
flaskRoutes.forEach(route => {
  app.use(route, flaskProxy);
});

module.exports = app;