// Wrapper server to start the application from app.js
// This file was simplified to avoid duplicate server start when both server.js and app.js existed.
const path = require('path');

// Require the main app module
const appModule = require('./app');

// If the module exports startServer, call it; otherwise, if it exports app, start it here.
if (appModule && typeof appModule.startServer === 'function') {
  appModule.startServer();
} else if (appModule && appModule.app) {
  const app = appModule.app;
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
} else {
  console.error('Could not start server: no startServer() or app exported from ./app');
  process.exit(1);
}

module.exports = appModule;
