// check-services.js
const { exec } = require('child_process');
const http = require('http');

function checkPort(port, serviceName) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/health',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ 
                        status: 'connected', 
                        data: jsonData,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    resolve({ 
                        status: 'connected', 
                        data: { raw: data },
                        statusCode: res.statusCode
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ status: 'error', error: err.message });
        });

        req.on('timeout', () => {
            resolve({ status: 'timeout', error: 'Timeout after 3s' });
        });

        req.end();
    });
}

function checkProcesses() {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' 
            ? 'tasklist /FI "IMAGENAME eq node.exe" /FI "IMAGENAME eq python.exe" /FI "IMAGENAME eq server.exe"'
            : 'ps aux | grep -E "node|python|server"';

        exec(command, (error, stdout, stderr) => {
            resolve(stdout || 'Aucun processus trouvé');
        });
    });
}

async function main() {
    console.log('🔍 DIAGNOSTIC COMPLET DES SERVICES\n');

    // 1. Vérifier les processus
    console.log('📊 PROCESSUS EN COURS:');
    const processes = await checkProcesses();
    console.log(processes);
    console.log('');

    // 2. Vérifier les ports
    const services = [
        { name: 'Node.js (3000)', port: 3000 },
        { name: 'Flask IA (5000)', port: 5000 },
        { name: 'Llama.cpp (8080)', port: 8080 }
    ];

    console.log('🌐 VERIFICATION DES PORTS:');
    for (const service of services) {
        process.stdout.write(`   ${service.name}... `);
        const result = await checkPort(service.port, service.name);
        
        if (result.status === 'connected') {
            console.log(`✅ CONNECTÉ (${result.statusCode})`);
            if (result.data) {
                console.log(`      📊 ${JSON.stringify(result.data)}`);
            }
        } else {
            console.log(`❌ ${result.status.toUpperCase()} - ${result.error}`);
        }
    }
    console.log('');

    // 3. Vérifier les fichiers
    console.log('📁 FICHIERS ESSENTIELS:');
    const essentialFiles = [
        'server.js',
        'app.py', 
        'public/app.js',
        'public/index.html',
        'llama.cpp/server.exe',
        'llama.cpp/phi-2.q4_0.gguf'
    ];

    const fs = require('fs');
    essentialFiles.forEach(file => {
        const exists = fs.existsSync(file);
        console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });
    console.log('');

    // 4. Suggestions
    console.log('💡 SUGGESTIONS:');
    if (!fs.existsSync('llama.cpp/server.exe')) {
        console.log('   • Téléchargez llama.cpp depuis: https://github.com/ggerganov/llama.cpp');
    }
    if (!fs.existsSync('node_modules')) {
        console.log('   • Exécutez: npm install');
    }
    console.log('   • Lancez manuellement: node server.js');
    console.log('   • Puis testez: curl http://localhost:3000/api/health');
}

main().catch(console.error);