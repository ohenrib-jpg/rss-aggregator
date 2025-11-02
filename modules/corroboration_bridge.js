const { spawn } = require('child_process');
const path = require('path');

async function find_corroborations(article, recent_articles, options = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'corroboration.py');
    const input = JSON.stringify({ article, recent_articles, options });

    const py = spawn('python', [scriptPath, input]);

    let output = '';
    let error = '';

    py.stdout.on('data', (data) => (output += data.toString()));
    py.stderr.on('data', (data) => (error += data.toString()));

    py.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', error);
        return reject(new Error('Python process failed'));
      }
      try {
        resolve(JSON.parse(output));
      } catch (e) {
        reject(new Error('Invalid JSON returned from Python'));
      }
    });
  });
}

module.exports = { find_corroborations };
