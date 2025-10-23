// test/health-check.js - Script de vérification de santé

const http = require('http');
const https = require('https');

const config = {
  // Adapter selon votre configuration
  local: {
    protocol: 'http',
    host: 'localhost',
    port: 3000
  },
  cloud: {
    protocol: 'https',
    host: 'votre-app.onrender.com',
    port: 443
  }
};

// Déterminer l'environnement
const env = process.argv[2] || 'local';
const target = config[env];

if (!target) {
  console.error('❌ Environnement invalide. Utilisez: node health-check.js [local|cloud]');
  process.exit(1);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`🏥 HEALTH CHECK - Mode ${env.toUpperCase()}`);
console.log('='.repeat(70));
console.log(`📍 URL: ${target.protocol}://${target.host}:${target.port}\n`);

const tests = [
  { name: 'Health Check', path: '/api/health' },
  { name: 'Articles API', path: '/api/articles?limit=5' },
  { name: 'Themes API', path: '/api/themes' },
  { name: 'Feeds API', path: '/api/feeds/manager' },
  { name: 'Stats API', path: '/api/stats' }
];

let passedTests = 0;
let failedTests = 0;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https' ? https : http;
    const options = {
      hostname: target.host,
      port: target.port,
      path: path,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'HealthCheck/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTest(test) {
  process.stdout.write(`🧪 ${test.name.padEnd(20)} ... `);

  try {
    const start = Date.now();
    const response = await makeRequest(test.path);
    const duration = Date.now() - start;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Vérifier que la réponse est du JSON valide
      try {
        const json = JSON.parse(response.body);
        console.log(`✅ PASS (${duration}ms)`);
        
        // Afficher des détails pour certains tests
        if (test.name === 'Health Check') {
          console.log(`   └─ Database: ${json.database || 'unknown'}`);
          console.log(`   └─ Service: ${json.service || 'unknown'}`);
        } else if (test.name === 'Articles API') {
          console.log(`   └─ Articles: ${json.total || json.articles?.length || 0}`);
        } else if (test.name === 'Stats API' && json.stats) {
          console.log(`   └─ Articles: ${json.stats.articles || 0}, Feeds: ${json.stats.feeds || 0}`);
        }
        
        passedTests++;
        return true;
      } catch (jsonError) {
        console.log(`⚠️  WARN - Invalid JSON`);
        console.log(`   └─ Response: ${response.body.substring(0, 100)}`);
        failedTests++;
        return false;
      }
    } else if (response.statusCode === 404) {
      console.log(`❌ FAIL - Route not found (404)`);
      failedTests++;
      return false;
    } else {
      console.log(`❌ FAIL - HTTP ${response.statusCode}`);
      failedTests++;
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`❌ FAIL - Server not running`);
    } else if (error.message === 'Request timeout') {
      console.log(`❌ FAIL - Timeout (>10s)`);
    } else {
      console.log(`❌ FAIL - ${error.message}`);
    }
    failedTests++;
    return false;
  }
}

async function runAllTests() {
  console.log('🔍 Running tests...\n');

  for (const test of tests) {
    await runTest(test);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passedTests}/${tests.length}`);
  console.log(`❌ Failed: ${failedTests}/${tests.length}`);
  
  const successRate = ((passedTests / tests.length) * 100).toFixed(1);
  console.log(`📈 Success Rate: ${successRate}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! System is healthy.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check logs for details.\n');
    process.exit(1);
  }
}

// Exécuter les tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
