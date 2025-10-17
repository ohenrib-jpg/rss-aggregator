// Simple database connector (placeholder filled)
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');
module.exports = db;
