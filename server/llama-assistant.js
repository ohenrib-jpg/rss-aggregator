class LlamaAssistant {
  constructor() {
    this.endpoint = process.env.LLAMA_ENDPOINT || "http://localhost:8080";
    this.enabled = process.env.LLAMA_ENABLED === 'true';
    this.learningJournal = [];
  }

  async analyzeError(error, context = {}) {
    if (!this.enabled) {
      return "🤖 Assistant Llama désactivé";
    }

    try {
      const prompt = this.buildDebugPrompt(error, context);
      const suggestion = await this.queryLlama(prompt);
      
      // Sauvegarde dans le journal d'apprentissage
      this.saveToLearningJournal(error, context, suggestion);
      
      return suggestion;
    } catch (llamaError) {
      return `❌ Erreur Llama: ${llamaError.message}. Vérifiez que llama.cpp est démarré.`;
    }
  }

  buildDebugPrompt(error, context) {
    return `
SYSTEM: Tu es Llama, assistant de débogage expert Node.js/Express. 
Sois concis, pratique et propose du code concret.

CONTEXTE: ${context.module || 'Server'} - ${context.route || 'Général'}
ERREUR: ${error.message}
STACK: ${error.stack?.substring(0, 500) || 'Non disponible'}
CODE CONCERNÉ: ${context.codeSnippet || 'Non spécifié'}

ANALYSE ET SOLUTION:
`;
  }

  async queryLlama(prompt) {
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "llama2",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || "Aucune suggestion";
  }

  saveToLearningJournal(error, context, suggestion) {
    const entry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      context,
      suggestion,
      resolved: false
    };
    
    this.learningJournal.push(entry);
    
    // Sauvegarde périodique dans un fichier
    if (this.learningJournal.length % 5 === 0) {
      this.persistLearningJournal();
    }
  }

  persistLearningJournal() {
    const fs = require('fs');
    const path = require('path');
    
    const journalPath = path.join(__dirname, 'learning-journal.json');
    fs.writeFileSync(journalPath, JSON.stringify(this.learningJournal, null, 2));
  }
}

module.exports = new LlamaAssistant();