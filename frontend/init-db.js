// Initialize database tables
const db = require('./database');
db.serialize(()=>{
  db.run('CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, title TEXT, url TEXT, date TEXT)');
  console.log('Database initialized.');
});
