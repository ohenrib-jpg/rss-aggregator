// public/ai-config.js - Configuration IA centralisée
window.aiConfigManager = (function() {
    const STORAGE_KEY = 'rssAggregatorAIConfig';
    
    const defaultConfig = {
        localAI: {
            enabled: true,
            url: "http://localhost:8080",
            model: "llama2",
            systemPrompt: "Vous êtes un assistant spécialisé dans l'analyse d'actualités et la détection de thèmes.",
            autoStart: false
        },
        openAI: {
            enabled: false,
            apiKey: "",
            model: "gpt-3.5-turbo"
        },
        priority: "local"
    };

    function loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
        } catch (error) {
            console.error('❌ Erreur chargement config IA:', error);
            return defaultConfig;
        }
    }

    function saveConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            return true;
        } catch (error) {
            console.error('❌ Erreur sauvegarde config IA:', error);
            return false;
        }
    }

    async function testLocalAIConnection() {
        const config = loadConfig();
        try {
            const response = await fetch(`${config.localAI.url}/health`, {
                method: 'GET',
                timeout: 5000
            });
            return {
                success: response.ok,
                message: response.ok ? "Connexion IA locale réussie" : "Erreur de connexion"
            };
        } catch (error) {
            return {
                success: false,
                error: "Serveur IA local non accessible"
            };
        }
    }

    async function testOpenAIConnection() {
        const config = loadConfig();
        // Simulation pour l'instant
        return {
            success: true,
            message: "Test OpenAI simulé - à implémenter"
        };
    }

    return {
        loadConfig,
        saveConfig,
        testLocalAIConnection,
        testOpenAIConnection
    };
})();
function saveAIConfig() {
    const key = document.getElementById('openai-key').value.trim();
    if (key) {
        localStorage.setItem('OPENAI_KEY', key);
        alert('Clé OpenAI sauvegardée localement.');
    }
}
function loadAIConfig() {
    const key = localStorage.getItem('OPENAI_KEY');
    if (key) {
        document.getElementById('openai-key').value = key;
    }
}
document.addEventListener('DOMContentLoaded', loadAIConfig);

async function testOpenAI() {
    const res = await fetch('/api/debug/test-openai');
    const data = await res.json();
    alert('Test OpenAI: ' + (data.status || JSON.stringify(data)));
}
