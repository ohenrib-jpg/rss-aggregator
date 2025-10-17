const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Proxy setup to forward /api/* to Flask backend when needed
const flaskProxyApp = require(path.join(__dirname, 'modules', 'proxy-setup'));
// Mount the proxy app early so /api routes are forwarded to Flask when appropriate
app.use(flaskProxyApp);


const app = express();
const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['content:encoded']
  }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fichiers de configuration
const CONFIG_FILE = path.join(__dirname, 'config.json');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const SENTIMENT_LEXICON_FILE = path.join(__dirname, 'sentiment-lexicon.json');
const IA_CORRECTIONS_FILE = path.join(__dirname, 'ia-corrections.json');

// Cache pour les données analysées
let cachedAnalysis = {
  articles: [],
  analysis: { themes: {}, timeline: {}, totalArticles: 0, trends: {}, metrics: {} },
  lastUpdate: null,
  isUpdating: false
};

// Historique des analyses pour calculer les tendances
let analysisHistory = [];

// Couleurs par défaut pour les thèmes
const DEFAULT_THEME_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#64748b'
];

// Initialiser les fichiers de configuration s'ils n'existent pas
function initializeConfigFiles() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ feeds: [] }, null, 2));
    console.log('📁 Fichier config.json créé');
  }
  if (!fs.existsSync(THEMES_FILE)) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify({ themes: [] }, null, 2));
    console.log('📁 Fichier themes.json créé');
  }
  if (!fs.existsSync(SENTIMENT_LEXICON_FILE)) {
    initializeSentimentLexicon();
    console.log('📁 Fichier sentiment-lexicon.json créé');
  }
  if (!fs.existsSync(IA_CORRECTIONS_FILE)) {
    fs.writeFileSync(IA_CORRECTIONS_FILE, JSON.stringify({
      corrections: [],
      lastCorrection: null,
      stats: {
        totalCorrections: 0,
        accuracyImprovement: 0,
        falsePositivesCorrected: 0,
        contextImprovements: 0
      }
    }, null, 2));
    console.log('📁 Fichier ia-corrections.json créé');
  }
}

// Initialiser le lexique de sentiment
function initializeSentimentLexicon() {
  const initialLexicon = {
    words: {
      'excellent': 2.0, 'exceptionnel': 2.0, 'remarquable': 2.0, 'formidable': 2.0,
      'parfait': 2.0, 'idéal': 2.0, 'sublime': 2.0, 'magnifique': 2.0,
      'génial': 1.8, 'fantastique': 1.8, 'incroyable': 1.8, 'merveilleux': 1.8,
      'superbe': 1.8, 'prodige': 1.8, 'miracle': 1.8, 'phénoménal': 1.8,
      'bon': 1.0, 'bien': 1.0, 'agréable': 1.0, 'positif': 1.0,
      'succès': 1.0, 'réussite': 1.0, 'progrès': 1.0, 'victoire': 1.0,
      'avancée': 1.0, 'amélioration': 1.0, 'innovation': 1.0, 'créatif': 1.0,
      'correct': 0.5, 'acceptable': 0.5, 'satisfaisant': 0.5, 'convenable': 0.5,
      'passable': 0.3, 'moyen': 0.2, 'standard': 0.1,
      'paix': 1.8, 'accord': 1.5, 'traité': 1.5, 'alliance': 1.3,
      'coopération': 1.5, 'dialogue': 1.2, 'négociation': 1.0, 'diplomatie': 1.2,
      'réconciliation': 1.8, 'cessez-le-feu': 1.5, 'résolution': 1.3,
      'entente': 1.4, 'partenariat': 1.2, 'solidarité': 1.5, 'aide': 1.0,
      'soutien': 1.0, 'espoir': 1.3, 'stabilité': 1.3, 'sécurité': 1.2,
      'libération': 1.5, 'démocratie': 1.2, 'liberté': 1.5, 'justice': 1.3,
      'développement': 1.0, 'reconstruction': 1.2, 'relance': 1.1,
      'croissance': 1.0, 'reprise': 1.1, 'investissement': 0.8,
      'catastrophe': -2.0, 'désastre': -2.0, 'horrible': -2.0, 'épouvantable': -2.0,
      'terrible': -2.0, 'abominable': -2.0, 'exécrable': -2.0, 'atroce': -2.0,
      'affreux': -1.8, 'détestable': -1.8, 'ignoble': -1.8, 'infâme': -1.8,
      'odieux': -1.8, 'méprisable': -1.8, 'haïssable': -1.8, 'immonde': -1.8,
      'mauvais': -1.0, 'négatif': -1.0, 'problème': -1.0, 'échec': -1.0,
      'difficile': -1.0, 'compliqué': -1.0, 'crise': -1.0, 'danger': -1.0,
      'risque': -1.0, 'menace': -1.0, 'défaite': -1.0,
      'décevant': -0.7, 'médiocre': -0.7, 'insuffisant': -0.7, 'faible': -0.7,
      'limité': -0.5, 'incomplet': -0.5, 'imparfait': -0.3, 'perfectible': -0.2,
      'guerre': -2.0, 'conflit': -1.8, 'violence': -1.8, 'attaque': -1.8,
      'bombardement': -2.0, 'invasion': -2.0, 'occupation': -1.8,
      'tension': -1.3, 'escalade': -1.5, 'hostilité': -1.6, 'antagonisme': -1.4,
      'sanction': -1.3, 'embargo': -1.5, 'blocus': -1.6, 'répression': -1.8,
      'violation': -1.5, 'abus': -1.6, 'torture': -2.0, 'massacre': -2.0,
      'génocide': -2.0, 'crimes': -1.8, 'terreur': -2.0, 'terrorisme': -2.0,
      'instabilité': -1.4, 'chaos': -1.8, 'anarchie': -1.7, 'désordre': -1.3,
      'corruption': -1.6, 'autoritarisme': -1.5, 'dictature': -1.8,
      'oppression': -1.8, 'censure': -1.4, 'persécution': -1.8,
      'famine': -2.0, 'pauvreté': -1.5, 'exode': -1.4, 'réfugiés': -1.3,
      'déstabilisation': -1.6, 'rupture': -1.2, 'blocage': -1.3,
      'impasse': -1.4, 'stagnation': -1.1
    },
    usageStats: {},
    learningRate: 0.1,
    version: '2.0',
    lastUpdated: new Date().toISOString()
  };
  
  fs.writeFileSync(SENTIMENT_LEXICON_FILE, JSON.stringify(initialLexicon, null, 2));
}

// Charger le lexique de sentiment
function loadSentimentLexicon() {
  try {
    const data = fs.readFileSync(SENTIMENT_LEXICON_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erreur chargement lexique:', error);
    initializeSentimentLexicon();
    return loadSentimentLexicon();
  }
}

// Sauvegarder le lexique de sentiment
function saveSentimentLexicon(lexicon) {
  lexicon.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SENTIMENT_LEXICON_FILE, JSON.stringify(lexicon, null, 2));
}

// Gestionnaire des corrections IA
class IACorrectionManager {
  constructor() {
    this.corrections = this.loadCorrections();
    this.iaApiKey = null;
    this.lastIACall = null;
    this.iaInterval = null;
  }

  loadCorrections() {
    try {
      if (fs.existsSync(IA_CORRECTIONS_FILE)) {
        return JSON.parse(fs.readFileSync(IA_CORRECTIONS_FILE, 'utf8'));
      }
      return {
        corrections: [],
        lastCorrection: null,
        stats: {
          totalCorrections: 0,
          accuracyImprovement: 0,
          falsePositivesCorrected: 0,
          contextImprovements: 0
        }
      };
    } catch (error) {
      return {
        corrections: [],
        lastCorrection: null,
        stats: {
          totalCorrections: 0,
          accuracyImprovement: 0,
          falsePositivesCorrected: 0,
          contextImprovements: 0
        }
      };
    }
  }

  saveCorrections() {
    try {
      fs.writeFileSync(IA_CORRECTIONS_FILE, JSON.stringify(this.corrections, null, 2));
    } catch (error) {
      console.error('❌ Erreur sauvegarde corrections IA:', error);
    }
  }

  setApiKey(apiKey) {
    this.iaApiKey = apiKey;
    if (apiKey) {
      this.startAutoCorrection();
    } else {
      this.stopAutoCorrection();
    }
  }

  startAutoCorrection() {
    // Correction automatique toutes les heures
    this.iaInterval = setInterval(async () => {
      await this.performIACorrection();
    }, 60 * 60 * 1000);
    
    console.log('🔄 Corrections IA automatiques activées (toutes les heures)');
    
    // Première correction immédiate
    setTimeout(() => this.performIACorrection(), 10000);
  }

  stopAutoCorrection() {
    if (this.iaInterval) {
      clearInterval(this.iaInterval);
      this.iaInterval = null;
      console.log('🛑 Corrections IA automatiques désactivées');
    }
  }

  async performIACorrection() {
    if (!this.iaApiKey || !cachedAnalysis.articles.length) {
      return;
    }

    try {
      console.log('🧠 Début de la correction IA');
      
      const articlesToCorrect = cachedAnalysis.articles.slice(0, 20);
      
      const response = await axios.post('https://rss-aggregator-1-wx0b.onrender.com/correct_analysis', {
        apiKey: this.iaApiKey,
        articles: articlesToCorrect,
        currentAnalysis: cachedAnalysis.analysis,
        themes: loadThemes().themes
      }, { timeout: 120000 });

      if (response.data.success) {
        await this.applyIACorrections(response.data.corrections);
        console.log('✅ Corrections IA appliquées avec succès');
      }

    } catch (error) {
      console.error('❌ Erreur correction IA:', error.message);
    }
  }

  async applyIACorrections(corrections) {
    corrections.forEach(correction => {
      const article = cachedAnalysis.articles.find(a => a.id === correction.articleId);
      if (article && article.sentiment) {
        const originalScore = article.sentiment.score;
        article.sentiment.score = correction.correctedScore;
        article.sentiment.iaCorrected = true;
        article.sentiment.correctionConfidence = correction.confidence;
        article.sentiment.originalScore = originalScore;
      }
    });

    const themes = loadThemes();
    cachedAnalysis.analysis = analyzeArticlesByTheme(cachedAnalysis.articles, themes.themes);
    
    this.corrections.corrections.push(corrections);
    this.corrections.lastCorrection = new Date().toISOString();
    this.corrections.stats.totalCorrections += corrections.length;
    this.saveCorrections();
  }

  updateSentimentLexicon(correction) {
    // À implémenter selon les besoins
  }
}

// Initialiser le gestionnaire IA
const iaCorrectionManager = new IACorrectionManager();

// SYSTÈME D'ANALYSE DE SENTIMENT AMÉLIORÉ AVEC DÉTECTION D'IRONIE
class SelfLearningSentiment {
  constructor() {
    this.lexicon = loadSentimentLexicon();
    
    this.negations = ['pas', 'non', 'ne', 'ni', 'aucun', 'rien', 'jamais', 'sans', 'guère'];
    this.intensifiers = {
      'très': 1.3, 'extrêmement': 1.5, 'vraiment': 1.2, 'particulièrement': 1.3,
      'fortement': 1.4, 'totalement': 1.4, 'complètement': 1.4, 'absolument': 1.5,
      'incroyablement': 1.6, 'exceptionnellement': 1.5, 'remarquablement': 1.4
    };
    this.attenuators = {
      'peu': 0.4, 'légèrement': 0.5, 'modérément': 0.6, 'relativement': 0.7,
      'assez': 0.8, 'plutôt': 0.7, 'quelque': 0.6, 'suffisamment': 0.8,
      'modestement': 0.5, 'faiblement': 0.4
    };
    
    this.ironyMarkers = {
      'bien sûr': -0.8, 'évidemment': -0.7, 'super': -0.6, 'génial': -0.6,
      'formidable': -0.7, 'parfait': -0.6, 'excellent': -0.7, 'magnifique': -0.6,
      'extraordinaire': -0.7, 'merveilleux': -0.6, 'quelle réussite': -0.8,
      'bravo': -0.5, 'felicitations': -0.5, 'impeccable': -0.6
    };
    
    this.contrastMarkers = [
      'mais', 'cependant', 'pourtant', 'toutefois', 'néanmoins', 
      'or', 'par contre', 'en revanche', 'alors que', 'tandis que'
    ];
    
    this.negativeContexts = ['malheureusement', 'hélas', 'dommage', 'déception', 'probleme'];
  }

  detectIrony(text, words, currentIndex) {
    const textLower = text.toLowerCase();
    
    for (const [phrase, score] of Object.entries(this.ironyMarkers)) {
      if (textLower.includes(phrase)) {
        const phraseIndex = textLower.indexOf(phrase);
        const contextBefore = textLower.substring(Math.max(0, phraseIndex - 50), phraseIndex);
        const contextAfter = textLower.substring(phraseIndex + phrase.length, phraseIndex + phrase.length + 50);
        
        const contextScore = this.analyzeContext(contextBefore + ' ' + contextAfter).score;
        const ironyStrength = score * (1 + Math.abs(contextScore));
        
        return {
          isIronic: true,
          score: ironyStrength,
          confidence: 0.8,
          phrase: phrase
        };
      }
    }
    
    if (currentIndex > 2) {
      const previousWords = words.slice(Math.max(0, currentIndex - 3), currentIndex);
      const hasContrast = previousWords.some(word => this.contrastMarkers.includes(word));
      
      if (hasContrast) {
        const sentimentBefore = this.analyzeWordsSentiment(previousWords);
        const currentWordScore = this.getWordScore(words[currentIndex]);
        
        if ((sentimentBefore > 0.3 && currentWordScore < -0.3) || 
            (sentimentBefore < -0.3 && currentWordScore > 0.3)) {
          return {
            isIronic: true,
            score: -currentWordScore * 0.8,
            confidence: 0.7,
            reason: 'contraste_detected'
          };
        }
      }
    }
    
    return { isIronic: false, score: 0, confidence: 0 };
  }

  analyzeLocalContext(words, currentIndex) {
    const contextWindow = 3;
    const start = Math.max(0, currentIndex - contextWindow);
    const end = Math.min(words.length, currentIndex + contextWindow + 1);
    
    const contextWords = words.slice(start, end);
    let contextModifier = 1.0;
    let contextConfidence = 1.0;
    
    for (let i = 0; i < contextWords.length; i++) {
      const word = contextWords[i];
      const relativePos = i - (currentIndex - start);
      
      if (this.negations.includes(word) && relativePos < 0) {
        contextModifier *= -1.2;
      }
      else if (this.intensifiers[word] && Math.abs(relativePos) <= 2) {
        contextModifier *= this.intensifiers[word];
        contextConfidence *= 1.1;
      }
      else if (this.attenuators[word] && Math.abs(relativePos) <= 2) {
        contextModifier *= this.attenuators[word];
        contextConfidence *= 0.9;
      }
    }
    
    return {
      modifier: contextModifier,
      confidence: Math.min(1.0, contextConfidence)
    };
  }

  analyzeContext(text) {
    const words = this.preprocessText(text);
    let score = 0;
    let count = 0;
    
    for (const word of words) {
      const wordScore = this.getWordScore(word);
      if (wordScore !== 0) {
        score += wordScore;
        count++;
      }
    }
    
    return {
      score: count > 0 ? score / count : 0,
      wordCount: count
    };
  }

  analyzeWordsSentiment(words) {
    let totalScore = 0;
    let count = 0;
    
    for (const word of words) {
      const score = this.getWordScore(word);
      if (score !== 0) {
        totalScore += score;
        count++;
      }
    }
    
    return count > 0 ? totalScore / count : 0;
  }

  detectExaggeration(words, currentIndex, wordScore) {
    if (Math.abs(wordScore) < 1.5) return { isExaggerated: false, modifier: 1.0 };
    
    const contextWords = words.slice(Math.max(0, currentIndex - 2), currentIndex + 3);
    const strongWords = contextWords.filter(w => Math.abs(this.getWordScore(w)) > 1.0);
    
    if (strongWords.length >= 3) {
      return {
        isExaggerated: true,
        modifier: 0.7,
        confidence: 0.6
      };
    }
    
    return { isExaggerated: false, modifier: 1.0 };
  }

  analyze(text) {
    if (!text || text.length < 10) {
      return { score: 0, sentiment: 'neutral', confidence: 0.05 };
    }

    const words = this.preprocessText(text);
    let totalScore = 0;
    let significantWords = 0;
    let confidence = 0;
    const wordScores = [];
    
    const contextScore = this.analyzeContext(text);
    let contextModifier = 1.0 + (contextScore.score * 0.3);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = this.getWordScore(word);
      
      if (Math.abs(wordScore) < 0.1 && !this.isSignificantWord(word)) {
        continue;
      }

      let modifier = 1.0;
      let wordConfidence = this.calculateWordConfidence(word);

      const ironyDetection = this.detectIrony(text, words, i);
      if (ironyDetection.isIronic) {
        wordScore = ironyDetection.score;
        wordConfidence = ironyDetection.confidence;
      }

      const localContext = this.analyzeLocalContext(words, i);
      modifier *= localContext.modifier;
      wordConfidence *= localContext.confidence;

      const exaggeration = this.detectExaggeration(words, i, wordScore);
      if (exaggeration.isExaggerated) {
        modifier *= exaggeration.modifier;
        wordConfidence *= 0.8;
      }

      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.negations.includes(words[j])) {
          modifier *= -1.2;
          break;
        }
      }

      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.intensifiers[words[j]]) {
          modifier *= this.intensifiers[words[j]];
          break;
        }
      }

      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.attenuators[words[j]]) {
          modifier *= this.attenuators[words[j]];
          break;
        }
      }

      const finalScore = wordScore * modifier;
      
      if (wordScore !== 0) {
        totalScore += finalScore;
        significantWords++;
        
        wordConfidence = this.calculateWordConfidence(word);
        confidence += wordConfidence;
        
        wordScores.push({
          word: word,
          baseScore: wordScore,
          finalScore: finalScore,
          confidence: wordConfidence,
          modifier: modifier,
          irony: ironyDetection.isIronic ? ironyDetection.phrase || true : false
        });
      }
    }

    let normalizedScore = 0;
    if (significantWords > 0) {
      normalizedScore = totalScore / significantWords;
    } else {
      normalizedScore = contextScore.score;
      significantWords = contextScore.wordCount;
    }
    
    const adjustedScore = (normalizedScore * 0.7) + (contextScore.score * 0.3);
    
    const averageConfidence = significantWords > 0 ? 
      Math.max(0.1, Math.min(0.95, confidence / significantWords)) : 0.1;

    const sentimentResult = this.determineSentiment(adjustedScore, wordScores);

    this.updateUsageStats(wordScores, adjustedScore);

    return {
      score: Math.round(adjustedScore * 100) / 100,
      sentiment: sentimentResult.sentiment,
      confidence: Math.round(averageConfidence * 100) / 100,
      wordCount: significantWords,
      words: wordScores,
      emotionalIntensity: sentimentResult.emotionalIntensity,
      contextScore: Math.round(contextScore.score * 100) / 100,
      ironyDetected: wordScores.some(ws => ws.irony)
    };
  }

  determineSentiment(normalizedScore, wordScores) {
    const emotionalIntensity = this.calculateEmotionalIntensity(wordScores);
    
    let positiveThreshold = 0.1;
    let negativeThreshold = -0.1;
    
    if (emotionalIntensity > 0.7) {
      positiveThreshold = 0.2;
      negativeThreshold = -0.2;
    } else if (emotionalIntensity < 0.3) {
      positiveThreshold = 0.05;
      negativeThreshold = -0.05;
    }

    let sentiment = 'neutral';
    if (normalizedScore > positiveThreshold) sentiment = 'positive';
    else if (normalizedScore < negativeThreshold) sentiment = 'negative';

    return {
      sentiment: sentiment,
      emotionalIntensity: emotionalIntensity
    };
  }

  calculateEmotionalIntensity(wordScores) {
    if (wordScores.length === 0) return 0;
    
    const intensity = wordScores.reduce((sum, word) => {
      return sum + Math.abs(word.finalScore);
    }, 0);
    
    return Math.min(1, intensity / wordScores.length * 2);
  }

  preprocessText(text) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  getWordScore(word) {
    return this.lexicon.words[word] || 0;
  }

  calculateWordConfidence(word) {
    const stats = this.lexicon.usageStats[word];
    if (!stats) return 0.5;
    
    const usageCount = stats.usageCount || 0;
    const consistency = stats.consistency || 0.5;
    
    return Math.min(0.95, 0.5 + (usageCount * 0.05) + (consistency * 0.3));
  }

  isSignificantWord(word) {
    return this.negations.includes(word) || 
           this.intensifiers[word] || 
           this.attenuators[word] ||
           this.contrastMarkers.includes(word);
  }

  updateUsageStats(wordScores, overallScore) {
    let lexiconUpdated = false;

    wordScores.forEach(({ word, baseScore, finalScore }) => {
      if (!this.lexicon.usageStats[word]) {
        this.lexicon.usageStats[word] = {
          usageCount: 0,
          totalScore: 0,
          consistency: 0.5,
          lastUsed: new Date().toISOString()
        };
      }

      const stats = this.lexicon.usageStats[word];
      stats.usageCount++;
      stats.lastUsed = new Date().toISOString();

      if (baseScore === 0 && stats.usageCount > 3) {
        const learnedScore = overallScore * 0.3;
        this.lexicon.words[word] = Math.max(-1, Math.min(1, learnedScore));
        lexiconUpdated = true;
      }

      if (baseScore !== 0 && stats.usageCount > 10) {
        const targetScore = overallScore * 0.7 + baseScore * 0.3;
        const adjustment = (targetScore - baseScore) * this.lexicon.learningRate;
        this.lexicon.words[word] = Math.max(-2, Math.min(2, baseScore + adjustment));
        lexiconUpdated = true;
        
        const scoreDiff = Math.abs(finalScore - overallScore);
        stats.consistency = 0.9 * stats.consistency + 0.1 * (1 - scoreDiff);
      }
    });

    if (lexiconUpdated) {
      saveSentimentLexicon(this.lexicon);
    }
  }

  learnFromCorrection(text, expectedScore) {
    const analysis = this.analyze(text);
    const error = expectedScore - analysis.score;
    
    if (Math.abs(error) > 0.2) {
      const words = this.preprocessText(text);
      
      words.forEach(word => {
        if (this.lexicon.words[word] !== undefined) {
          this.lexicon.words[word] += error * this.lexicon.learningRate * 2;
          this.lexicon.words[word] = Math.max(-2, Math.min(2, this.lexicon.words[word]));
        }
      });
      
      saveSentimentLexicon(this.lexicon);
    }
  }

  getLearningStats() {
    const words = Object.keys(this.lexicon.words);
    const learnedWords = Object.keys(this.lexicon.usageStats).filter(word => 
      this.lexicon.usageStats[word].usageCount > 5
    );
    
    const totalUsage = Object.values(this.lexicon.usageStats).reduce((sum, stats) => sum + stats.usageCount, 0);
    const averageConfidence = learnedWords.length > 0 ? 
      learnedWords.reduce((sum, word) => sum + this.calculateWordConfidence(word), 0) / learnedWords.length : 0;
    
    return {
      totalWords: words.length,
      learnedWords: learnedWords.length,
      totalUsage: totalUsage,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      learningRate: this.lexicon.learningRate,
      lastUpdated: this.lexicon.lastUpdated,
      version: this.lexicon.version
    };
  }
}

// Initialiser l'analyseur de sentiment
const sentimentAnalyzer = new SelfLearningSentiment();

// Charger la configuration
function loadConfig() {
  try {
    initializeConfigFiles();
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('Erreur chargement config:', error);
    return { feeds: [] };
  }
}

function loadThemes() {
  try {
    initializeConfigFiles();
    const themesData = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
    
    themesData.themes = themesData.themes.map((theme, index) => {
      if (!theme.color) {
        theme.color = DEFAULT_THEME_COLORS[index % DEFAULT_THEME_COLORS.length];
      }
      return theme;
    });
    
    return themesData;
  } catch (error) {
    console.error('Erreur chargement thèmes:', error);
    return { themes: [] };
  }
}

// Sauvegarder la configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function saveThemes(themes) {
  fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
}

// Analyser l'efficacité des mots-clés
function analyzeKeywordEffectiveness(articles, themes) {
  const keywordAnalysis = {};
  
  themes.forEach(theme => {
    keywordAnalysis[theme.name] = {};
    
    theme.keywords.forEach(keyword => {
      const matches = articles.filter(article => {
        const content = (article.title + ' ' + article.content).toLowerCase();
        return content.includes(keyword.toLowerCase());
      }).length;
      
      keywordAnalysis[theme.name][keyword] = {
        matches: matches,
        effectiveness: articles.length > 0 ? ((matches / articles.length) * 100).toFixed(1) : '0'
      };
    });
  });
  
  return keywordAnalysis;
}

// Analyser les co-occurrences entre thèmes
function analyzeThemeCorrelations(articles, themes) {
  const correlations = {};
  const themeNames = themes.map(theme => theme.name);
  
  themeNames.forEach(theme1 => {
    correlations[theme1] = {};
    themeNames.forEach(theme2 => {
      correlations[theme1][theme2] = 0;
    });
  });
  
  articles.forEach(article => {
    const content = (article.title + ' ' + article.content).toLowerCase();
    const matchingThemes = themes.filter(theme => 
      theme.keywords.some(keyword => content.includes(keyword.toLowerCase()))
    ).map(theme => theme.name);
    
    matchingThemes.forEach(theme1 => {
      matchingThemes.forEach(theme2 => {
        if (theme1 !== theme2) {
          correlations[theme1][theme2]++;
        }
      });
    });
  });
  
  return correlations;
}

// Calculer les tendances temporelles
function calculateTrends(currentAnalysis, previousAnalysis) {
  const trends = {};
  
  if (!previousAnalysis) return trends;
  
  Object.keys(currentAnalysis.themes).forEach(themeName => {
    const currentCount = currentAnalysis.themes[themeName].count;
    const previousCount = previousAnalysis.themes[themeName]?.count || 0;
    
    let growth = 0;
    if (previousCount > 0) {
      growth = ((currentCount - previousCount) / previousCount * 100);
    } else if (currentCount > 0) {
      growth = 100;
    }
    
    trends[themeName] = {
      growth: Math.round(growth * 10) / 10,
      trend: growth > 5 ? 'up' : growth < -5 ? 'down' : 'stable',
      currentCount: currentCount,
      previousCount: previousCount
    };
  });
  
  return trends;
}

// Analyser la saisonnalité (simplifiée)
function analyzeSeasonality(timeline) {
  const monthlyData = {};
  const dates = Object.keys(timeline).sort();
  
  dates.forEach(date => {
    const month = date.substring(0, 7);
    if (!monthlyData[month]) {
      monthlyData[month] = {};
    }
    
    Object.keys(timeline[date]).forEach(theme => {
      if (!monthlyData[month][theme]) {
        monthlyData[month][theme] = 0;
      }
      monthlyData[month][theme] += timeline[date][theme];
    });
  });
  
  return monthlyData;
}

// Fonction d'analyse des articles par thème
function analyzeArticlesByTheme(articles, themes) {
  const analysis = {
    themes: {},
    timeline: {},
    totalArticles: articles.length,
    trends: {},
    metrics: {
      keywordEffectiveness: {},
      correlations: {},
      seasonality: {},
      sentiment: {},
      learningStats: sentimentAnalyzer.getLearningStats()
    }
  };

  themes.forEach(theme => {
    analysis.themes[theme.name] = {
      count: 0,
      articles: [],
      keywords: theme.keywords,
      color: theme.color || DEFAULT_THEME_COLORS[0],
      keywordMatches: {},
      sentiment: {
        positive: 0,
        negative: 0,
        neutral: 0,
        averageScore: 0,
        averageConfidence: 0,
        articles: []
      }
    };
  });

  articles.forEach(article => {
    const content = (article.title + ' ' + (article.content || '')).toLowerCase();
    let articleDate;
    
    try {
      articleDate = new Date(article.pubDate);
      if (isNaN(articleDate.getTime())) articleDate = new Date();
    } catch (error) {
      articleDate = new Date();
    }
    
    const dateKey = articleDate.toISOString().split('T')[0];

    if (!analysis.timeline[dateKey]) {
      analysis.timeline[dateKey] = {};
      themes.forEach(theme => {
        analysis.timeline[dateKey][theme.name] = 0;
      });
    }

    const fullText = article.title + ' ' + (article.content || '');
    const sentimentResult = sentimentAnalyzer.analyze(fullText);
    article.sentiment = sentimentResult;

    themes.forEach(theme => {
      const hasKeyword = theme.keywords.some(keyword => 
        content.includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        analysis.themes[theme.name].count++;
        analysis.themes[theme.name].articles.push(article);
        analysis.timeline[dateKey][theme.name]++;
        
        const themeSentiment = analysis.themes[theme.name].sentiment;
        themeSentiment[sentimentResult.sentiment]++;
        themeSentiment.articles.push({
          title: article.title,
          sentiment: sentimentResult,
          date: article.pubDate,
          link: article.link,
          content: article.content
        });
        
        theme.keywords.forEach(keyword => {
          if (content.includes(keyword.toLowerCase())) {
            if (!analysis.themes[theme.name].keywordMatches[keyword]) {
              analysis.themes[theme.name].keywordMatches[keyword] = 0;
            }
            analysis.themes[theme.name].keywordMatches[keyword]++;
          }
        });
      }
    });
  });

  Object.keys(analysis.themes).forEach(themeName => {
    const theme = analysis.themes[themeName];
    const sentiment = theme.sentiment;
    const totalArticles = sentiment.articles.length;
    
    if (totalArticles > 0) {
      const totalScore = sentiment.articles.reduce((sum, article) => 
        sum + (article.sentiment?.score || 0), 0
      );
      const totalConfidence = sentiment.articles.reduce((sum, article) => 
        sum + (article.sentiment?.confidence || 0), 0
      );
      
      sentiment.averageScore = Math.round((totalScore / totalArticles) * 100) / 100;
      sentiment.averageConfidence = Math.round((totalConfidence / totalArticles) * 100) / 100;
      
      sentiment.positivePercent = Math.round((sentiment.positive / totalArticles) * 100);
      sentiment.negativePercent = Math.round((sentiment.negative / totalArticles) * 100);
      sentiment.neutralPercent = Math.round((sentiment.neutral / totalArticles) * 100);
      
      sentiment.labels = {
        positive: 'Évolution positive',
        neutral: 'Neutre', 
        negative: 'Évolution Négative'
      };
    }
  });

  analysis.metrics.keywordEffectiveness = analyzeKeywordEffectiveness(articles, themes);
  analysis.metrics.correlations = analyzeThemeCorrelations(articles, themes);
  analysis.metrics.seasonality = analyzeSeasonality(analysis.timeline);
  
  if (analysisHistory.length > 0) {
    const previousAnalysis = analysisHistory[analysisHistory.length - 1];
    analysis.trends = calculateTrends(analysis, previousAnalysis);
  }

  return analysis;
}

// Fonction pour rafraîchir les données
async function refreshData() {
  if (cachedAnalysis.isUpdating) {
    console.log('⚠️  Rafraîchissement déjà en cours');
    return;
  }

  try {
    cachedAnalysis.isUpdating = true;
    console.log('🔄 Rafraîchissement des flux RSS');
    
    const config = loadConfig();
    const themes = loadThemes();
    const allArticles = [];

    if (config.feeds.length === 0) {
      cachedAnalysis = {
        articles: [],
        analysis: { 
          themes: {}, 
          timeline: {}, 
          totalArticles: 0, 
          trends: {}, 
          metrics: {
            keywordEffectiveness: {},
            correlations: {},
            seasonality: {},
            sentiment: {},
            learningStats: sentimentAnalyzer.getLearningStats()
          }
        },
        lastUpdate: new Date(),
        isUpdating: false
      };
      return;
    }

    for (const feedUrl of config.feeds) {
      try {
        console.log(`📥 Récupération du flux: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        const articles = feed.items.map(item => {
          let pubDate;
          try {
            pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
          } catch (error) {
            pubDate = new Date().toISOString();
          }
          
          return {
            title: item.title || 'Sans titre',
            content: (item.contentSnippet || item.content || item['content:encoded'] || '').substring(0, 500),
            link: item.link || '#',
            pubDate: pubDate,
            feed: feed.title || 'Flux inconnu',
            id: item.link || item.guid || Math.random().toString(36)
          };
        });
        allArticles.push(articles);
        console.log(`✅ ${articles.length} articles récupérés de ${feed.title || feedUrl}`);
      } catch (error) {
        console.error(`❌ Erreur avec le flux ${feedUrl}:`, error.message);
      }
    }

    const uniqueArticles = allArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.id === article.id)
    );

    if (cachedAnalysis.analysis && cachedAnalysis.analysis.themes) {
      analysisHistory.push({
        cachedAnalysis.analysis,
        timestamp: cachedAnalysis.lastUpdate
      });
      
      if (analysisHistory.length > 10) {
        analysisHistory = analysisHistory.slice(-10);
      }
    }

    const analysis = analyzeArticlesByTheme(uniqueArticles, themes.themes);
    
    cachedAnalysis = {
      articles: uniqueArticles,
      analysis: analysis,
      lastUpdate: new Date(),
      isUpdating: false
    };

    const learningStats = sentimentAnalyzer.getLearningStats();
    console.log(`✅ Données rafraîchies: ${uniqueArticles.length} articles, ${Object.keys(analysis.themes).length} thèmes analysés`);
    
  } catch (error) {
    console.error('❌ Erreur lors du rafraîchissement:', error);
    cachedAnalysis.isUpdating = false;
  }
}

// Routes API

// Récupérer tous les articles (avec cache)
app.get('/api/articles', async (req, res) => {
  try {
    if (!cachedAnalysis.lastUpdate || cachedAnalysis.articles.length === 0) {
      await refreshData();
    }
    
    res.json({
      articles: cachedAnalysis.articles,
      analysis: cachedAnalysis.analysis,
      lastUpdate: cachedAnalysis.lastUpdate,
      isUpdating: cachedAnalysis.isUpdating,
      iaCorrections: iaCorrectionManager.corrections
    });
  } catch (error) {
    console.error('Erreur API articles:', error);
    res.status(500).json({ 
      error: error.message,
      articles: [],
      analysis: { 
        themes: {}, 
        timeline: {}, 
        totalArticles: 0, 
        trends: {}, 
        metrics: {
          keywordEffectiveness: {},
          correlations: {},
          seasonality: {},
          sentiment: {},
          learningStats: sentimentAnalyzer.getLearningStats()
        }
      },
      lastUpdate: null
    });
  }
});

// Forcer le rafraîchissement manuel
app.post('/api/refresh', async (req, res) => {
  try {
    await refreshData();
    res.json({ 
      success: true, 
      message: 'Données rafraîchies avec succès',
      lastUpdate: cachedAnalysis.lastUpdate
    });
  } catch (error) {
    console.error('Erreur API refresh:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// NOUVELLE ROUTE : Configuration de l'API IA
app.post('/api/ia/config', (req, res) => {
  try {
    const { apiKey, enableAutoCorrection } = req.body;
    
    if (apiKey) {
      iaCorrectionManager.setApiKey(apiKey);
      console.log('🔑 Clé API IA configurée');
    } else {
      iaCorrectionManager.setApiKey(null);
      console.log('🔑 Clé API IA désactivée');
    }
    
    res.json({ 
      success: true, 
      message: 'Configuration IA mise à jour',
      autoCorrectionEnabled: !!apiKey
    });
    
  } catch (error) {
    console.error('Erreur configuration IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NOUVELLE ROUTE : Correction IA manuelle
app.post('/api/ia/correct', async (req, res) => {
  try {
    await iaCorrectionManager.performIACorrection();
    res.json({ 
      success: true, 
      message: 'Correction IA effectuée',
      corrections: iaCorrectionManager.corrections
    });
  } catch (error) {
    console.error('Erreur correction IA manuelle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NOUVELLE ROUTE : Analyse IA avancée
app.post('/api/ia/advanced_analyze', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Clé API requise' });
    }

    const articlesToAnalyze = cachedAnalysis.articles.slice(0, 8);
    const themes = loadThemes();
    
    const response = await axios.post('https://rss-aggregator-1-wx0b.onrender.com/analyze_full', {
      apiKey: apiKey,
      feed: {
        source: 'rss_aggregator',
        articles: articlesToAnalyze,
        currentAnalysis: cachedAnalysis.analysis,
        themes: themes.themes
      }
    }, { timeout: 180000 }); // 3 minutes timeout

    res.json({
      success: true,
      response.data
    });
    
  } catch (error) {
    console.error('Erreur analyse IA avancée:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Le service IA avancé nécessite plus de temps de traitement'
    });
  }
});

// NOUVELLE ROUTE : Analyse IA complète avec rapport
app.post('/api/ia/analyze', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Clé API requise' });
    }

    const articlesToAnalyze = cachedAnalysis.articles.slice(0, 20);
    const themes = loadThemes();
    
    const response = await axios.post('https://rss-aggregator-1-wx0b.onrender.com/analyze_full', {
      apiKey: apiKey,
      feed: {
        source: 'rss_aggregator',
        articles: articlesToAnalyze,
        currentAnalysis: cachedAnalysis.analysis,
        themes: themes.themes
      }
    }, { timeout: 120000 });

    res.json({
      success: true,
      response.data
    });
    
  } catch (error) {
    console.error('Erreur analyse IA complète:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Assurez-vous que le microservice Flask est démarré sur le port 5051'
    });
  }
});

// Gérer les flux RSS
app.get('/api/feeds', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config.feeds);
  } catch (error) {
    console.error('Erreur API feeds GET:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }

    const config = loadConfig();
    
    if (config.feeds.includes(url)) {
      return res.status(400).json({ success: false, error: 'URL déjà existante' });
    }

    config.feeds.push(url);
    saveConfig(config);
    await refreshData();
    
    res.json({ success: true, feeds: config.feeds });
  } catch (error) {
    console.error('Erreur API feeds POST:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/feeds', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }

    const config = loadConfig();
    
    config.feeds = config.feeds.filter(feed => feed !== url);
    saveConfig(config);
    await refreshData();
    
    res.json({ success: true, feeds: config.feeds });
  } catch (error) {
    console.error('Erreur API feeds DELETE:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Gérer les thèmes
app.get('/api/themes', (req, res) => {
  try {
    const themes = loadThemes();
    res.json(themes.themes);
  } catch (error) {
    console.error('Erreur API themes GET:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/themes', async (req, res) => {
  try {
    const { name, keywords, color } = req.body;
    
    if (!name || !keywords) {
      return res.status(400).json({ success: false, error: 'Nom et mots-clés requis' });
    }
  
    const themesData = loadThemes();
    
    const newTheme = {
      id: Date.now().toString(),
      name,
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
      color: color || DEFAULT_THEME_COLORS[themesData.themes.length % DEFAULT_THEME_COLORS.length]
    };
    
    themesData.themes.push(newTheme);
    saveThemes(themesData);
    await refreshData();
    
    res.json({ success: true, theme: newTheme });
  } catch (error) {
    console.error('Erreur API themes POST:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const themesData = loadThemes();
    
    themesData.themes = themesData.themes.filter(theme => theme.id !== id);
    saveThemes(themesData);
    await refreshData();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur API themes DELETE:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Statistiques d'apprentissage
app.get('/api/sentiment/stats', (req, res) => {
  try {
    const learningStats = sentimentAnalyzer.getLearningStats();
    res.json({
      success: true,
      learningStats: learningStats,
      lexiconInfo: {
        totalWords: Object.keys(sentimentAnalyzer.lexicon.words).length,
        usageStats: sentimentAnalyzer.lexicon.usageStats
      }
    });
  } catch (error) {
    console.error('Erreur API stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apprentissage manuel
app.post('/api/sentiment/learn', (req, res) => {
  try {
    const { text, expectedScore } = req.body;
    
    if (!text || expectedScore === undefined) {
      return res.status(400).json({ success: false, error: 'Texte et score attendu requis' });
    }

    sentimentAnalyzer.learnFromCorrection(text, expectedScore);
    
    res.json({ 
      success: true, 
      message: 'Correction appliquée avec succès',
      learningStats: sentimentAnalyzer.getLearningStats()
    });
  } catch (error) {
    console.error('Erreur API apprentissage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Réinitialiser l'apprentissage
app.post('/api/sentiment/reset', (req, res) => {
  try {
    initializeSentimentLexicon();
    res.json({ 
      success: true, 
      message: 'Apprentissage réinitialisé',
      learningStats: sentimentAnalyzer.getLearningStats()
    });
  } catch (error) {
    console.error('Erreur API reset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export JSON
app.get('/api/export/json', async (req, res) => {
  try {
    if (!cachedAnalysis.lastUpdate) {
      await refreshData();
    }

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalArticles: cachedAnalysis.articles.length,
        totalThemes: Object.keys(cachedAnalysis.analysis.themes).length,
        lastUpdate: cachedAnalysis.lastUpdate,
        learningStats: sentimentAnalyzer.getLearningStats(),
        iaCorrections: iaCorrectionManager.corrections
      },
      configuration: {
        feeds: loadConfig().feeds,
        themes: loadThemes().themes
      },
      data: {
        articles: cachedAnalysis.articles,
        analysis: cachedAnalysis.analysis
      },
      sentimentLexicon: sentimentAnalyzer.lexicon
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="rss-export.json"');
    res.send(JSON.stringify(exportData, null, 2));
    
  } catch (error) {
    console.error('Erreur API export JSON:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Export CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    if (!cachedAnalysis.lastUpdate) {
      await refreshData();
    }

    const headers = ['Titre', 'Source', 'Date', 'Lien', 'Thèmes correspondants', 'Score Sentiment', 'Confiance', 'Corrigé IA'];
    
    const csvData = cachedAnalysis.articles.map(article => {
      const matchingThemes = [];
      
      Object.keys(cachedAnalysis.analysis.themes).forEach(themeName => {
        const theme = cachedAnalysis.analysis.themes[themeName];
        if (theme.articles.some(a => a.id === article.id)) {
          matchingThemes.push(themeName);
        }
      });

      return [
        `"${(article.title || '').replace(/"/g, '""')}"`,
        `"${(article.feed || '').replace(/"/g, '""')}"`,
        `"${new Date(article.pubDate).toLocaleDateString('fr-FR')}"`,
        `"${(article.link || '').replace(/"/g, '""')}"`,
        `"${matchingThemes.join(', ')}"`,
        article.sentiment?.score || 0,
        article.sentiment?.confidence || 0,
        article.sentiment?.iaCorrected ? 'Oui' : 'Non'
      ].join(',');
    });

    const csvContent = [headers.join(','), csvData].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rss-export.csv"');
    res.send('\uFEFF' + csvContent);
    
  } catch (error) {
    console.error('Erreur API export CSV:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Route racine - servir index.html depuis public
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route de fallback pour SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, async () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📁 Dossier public: ${path.join(__dirname, 'public')}`);
  console.log(`📁 Dossier courant: ${__dirname}`);
  
  initializeConfigFiles();
  
  console.log('🔄 Premier rafraîchissement des données');
  await refreshData();
  
  setInterval(async () => {
    await refreshData();
  }, 30000);
  
  console.log('🔄 Rafraîchissement automatique activé (30 secondes)');
  console.log('🧠 Module IA intégré avec corrections automatiques (toutes les heures)');
  console.log('📤 Export disponible: /api/export/json et /api/export/csv');
  console.log('🎨 Personnalisation des couleurs par thème activée');
  console.log('📈 Analyse avancée des tendances activée');
  console.log('🧠 Analyse de sentiment avec apprentissage automatique activée');
  console.log('🎭 Détection d\'ironie et de contexte activée');
  console.log('🔧 Routes IA disponibles:');
  console.log('   - POST /api/ia/config → Configuration clé API');
  console.log('   - POST /api/ia/correct → Correction manuelle');
  console.log('   - POST /api/ia/analyze → Analyse complète + rapport');
});

# --- appended from EVO4 (safe lines) ---
// server.js - Version avec proxy vers Flask IA
const { pool, initializeDatabase } = require('./db/database');
  customFields: { item: ['content:encoded'] }
// Configuration
const NODE_ENV = process.env.NODE_ENV || 'production';
const FLASK_API_URL = process.env.FLASK_API_URL || 'https://rss-aggregator-2.onrender.com';
console.log(`🔧 Configuration:`);
console.log(`   - Node.js port: ${PORT}`);
console.log(`   - Flask API: ${FLASK_API_URL}`);
console.log(`   - Environment: ${NODE_ENV}`);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));
// ============ ANALYSEUR DE SENTIMENT (LOCAL) ============
    this.lexicon = new Map();
    this.loadLexicon();
  async loadLexicon() {
      const result = await pool.query('SELECT word, score FROM sentiment_lexicon');
      result.rows.forEach(row => {
        this.lexicon.set(row.word, parseFloat(row.score));
      console.log(`📚 Lexique chargé: ${this.lexicon.size} mots`);
      console.warn('⚠️ Lexique DB non disponible, utilisation du lexique par défaut');
      this.loadDefaultLexicon();
  loadDefaultLexicon() {
    const defaultWords = {
      'excellent': 2.0, 'exceptionnel': 2.0, 'formidable': 2.0, 'parfait': 2.0,
      'génial': 1.8, 'fantastique': 1.8, 'merveilleux': 1.8, 'superbe': 1.8,
      'bon': 1.0, 'bien': 1.0, 'positif': 1.0, 'succès': 1.0, 'réussite': 1.0,
      'paix': 1.8, 'accord': 1.5, 'coopération': 1.5, 'dialogue': 1.2,
      'catastrophe': -2.0, 'désastre': -2.0, 'horrible': -2.0, 'terrible': -2.0,
      'crise': -1.0, 'danger': -1.0, 'menace': -1.0, 'guerre': -2.0,
      'conflit': -1.8, 'violence': -1.8, 'sanction': -1.3, 'tension': -1.3
    Object.entries(defaultWords).forEach(([word, score]) => {
      this.lexicon.set(word, score);
      return { score: 0, sentiment: 'neutral', confidence: 0.05, wordCount: 0 };
      let wordScore = this.lexicon.get(word) || 0;
      if (Math.abs(wordScore) < 0.1) continue;
      // Négations
          wordScore *= -1.2;
      // Intensificateurs
          wordScore *= this.intensifiers[words[j]];
      totalScore += wordScore;
    let normalizedScore = significantWords > 0 ? totalScore / significantWords : 0;
    if (normalizedScore > 0.1) sentiment = 'positive';
    else if (normalizedScore < -0.1) sentiment = 'negative';
    const confidence = Math.min(0.95, Math.max(0.1, 0.3 + (significantWords * 0.05)));
      score: Math.round(normalizedScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
// ============ GESTIONNAIRE POSTGRESQL ============
class PostgreSQLManager {
  async saveArticle(articleData) {
    const { title, content, link, pubDate, feedUrl, sentiment } = articleData;
      const result = await pool.query(`
        INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (link) DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          pub_date = EXCLUDED.pub_date,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_type = EXCLUDED.sentiment_type,
          sentiment_confidence = EXCLUDED.sentiment_confidence
        RETURNING *
      `, [title, content, link, pubDate, feedUrl, 
          sentiment?.score || 0, sentiment?.sentiment || 'neutral', sentiment?.confidence || 0]);
      return result.rows[0];
      console.error('❌ Erreur sauvegarde article:', error);
      throw error;
  async getArticles(limit = 50, offset = 0) {
      const result = await pool.query(`
        SELECT a.*, 
          ARRAY(
            SELECT DISTINCT t.name 
            FROM theme_analyses ta 
            JOIN themes t ON ta.theme_id = t.id 
            WHERE ta.article_id = a.id
          ) as themes
        FROM articles a 
        ORDER BY a.pub_date DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        link: row.link,
        pubDate: row.pub_date,
        feed: row.feed_url,
          score: parseFloat(row.sentiment_score),
          sentiment: row.sentiment_type,
          confidence: parseFloat(row.sentiment_confidence)
        themes: row.themes || []
      }));
      console.error('❌ Erreur récupération articles:', error);
      return [];
  async getThemes() {
      const result = await pool.query('SELECT * FROM themes ORDER BY name');
      return result.rows;
      console.error('❌ Erreur récupération thèmes:', error);
      return [];
  async getFeeds() {
      const result = await pool.query('SELECT url FROM feeds WHERE is_active = true');
      return result.rows.map(row => row.url);
      console.error('❌ Erreur récupération flux:', error);
      return [];
const dbManager = new PostgreSQLManager();
// ============ REFRESH FLUX RSS ============
    const feeds = await dbManager.getFeeds();
    if (feeds.length === 0) {
      console.log('⚠️ Aucun flux RSS configuré');
      return [];
    const limitedFeeds = feeds.slice(0, 5);
    for (const feedUrl of limitedFeeds) {
        console.log(`📥 Récupération: ${feedUrl}`);
        const limitedItems = feed.items.slice(0, 10);
        for (const item of limitedItems) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          const fullText = (item.title || '') + ' ' + (item.contentSnippet || item.content || '');
          const sentimentResult = sentimentAnalyzer.analyze(fullText);
          const articleData = {
            content: (item.contentSnippet || item.content || '').substring(0, 500),
            link: item.link || `#${Date.now()}`,
            pubDate: pubDate.toISOString(),
            feedUrl: feedUrl,
            sentiment: sentimentResult
          await dbManager.saveArticle(articleData);
          allArticles.push(articleData);
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
    console.log(`✅ ${allArticles.length} articles rafraîchis`);
    return allArticles;
    console.error('❌ Erreur rafraîchissement:', error);
    return [];
// ============ ROUTES API LOCALES (NODE.JS) ============
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const articles = await dbManager.getArticles(limit, offset);
      articles: articles,
      totalArticles: articles.length,
      lastUpdate: new Date().toISOString()
    console.error('❌ Erreur /api/articles:', error);
app.get('/api/themes', async (req, res) => {
    const themes = await dbManager.getThemes();
    res.json(themes);
    console.error('❌ Erreur /api/themes:', error);
app.get('/api/feeds', async (req, res) => {
    const feeds = await dbManager.getFeeds();
    res.json(feeds);
    console.error('❌ Erreur /api/feeds:', error);
    const articles = await refreshData();
      message: 'Données rafraîchies',
      articlesCount: articles.length,
      lastUpdate: new Date().toISOString()
    console.error('❌ Erreur /api/refresh:', error);
// ============ ROUTES PROXY VERS FLASK (IA) ============
// Helper pour appeler Flask
async function callFlask(endpoint, method = 'GET', data = null) {
    const url = `${FLASK_API_URL}${endpoint}`;
    console.log(`🔗 Proxy Flask: ${method} ${url}`);
    const config = {
      method: method,
      url: url,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    if (data && method === 'POST') {
      config.data = data;
    const response = await axios(config);
    return response.data;
    console.error(`❌ Erreur proxy Flask ${endpoint}:`, error.message);
    throw error;
// Stats de sentiment (via Flask pour analyse avancée)
app.get('/api/sentiment/stats', async (req, res) => {
    const days = req.query.days || 7;
    const data = await callFlask(`/api/sentiment/stats?days=${days}`);
    res.json(data);
    // Fallback local si Flask indisponible
    console.warn('⚠️ Flask indisponible, calcul local du sentiment');
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN sentiment_type = 'positive' THEN 1 END) as positive,
          COUNT(CASE WHEN sentiment_type = 'negative' THEN 1 END) as negative,
          COUNT(CASE WHEN sentiment_type = 'neutral' THEN 1 END) as neutral,
          AVG(sentiment_score) as average_score
        FROM articles
        WHERE pub_date > NOW() - INTERVAL '${req.query.days || 7} days'
      `);
      res.json({ success: true, stats: result.rows[0] });
    } catch (dbError) {
      res.status(500).json({ success: false, error: 'Service indisponible' });
// Métriques avancées (Flask IA)
app.get('/api/metrics', async (req, res) => {
    const days = req.query.days || 30;
    const data = await callFlask(`/api/metrics?days=${days}`);
    res.json(data);
    console.error('❌ Erreur /api/metrics:', error);
    res.status(500).json({ success: false, error: 'Metrics service unavailable' });
// Analyse géopolitique (Flask IA)
app.get('/api/geopolitical/report', async (req, res) => {
    const data = await callFlask('/api/geopolitical/report');
    res.json(data);
    console.error('❌ Erreur /api/geopolitical/report:', error);
app.get('/api/geopolitical/crisis-zones', async (req, res) => {
    const data = await callFlask('/api/geopolitical/crisis-zones');
    res.json(data);
app.get('/api/geopolitical/relations', async (req, res) => {
    const data = await callFlask('/api/geopolitical/relations');
    res.json(data);
// Stats d'apprentissage (Flask IA)
app.get('/api/learning-stats', async (req, res) => {
    const data = await callFlask('/api/learning-stats');
    res.json(data);
    console.error('❌ Erreur /api/learning-stats:', error);
// Analyse approfondie d'un article (Flask IA)
app.post('/api/analyze', async (req, res) => {
    const data = await callFlask('/api/analyze', 'POST', req.body);
    res.json(data);
    console.error('❌ Erreur /api/analyze:', error);
// ============ ROUTES UTILITAIRES ============
app.get('/health', async (req, res) => {
    const dbTest = await pool.query('SELECT 1');
    let flaskStatus = 'disconnected';
      await axios.get(`${FLASK_API_URL}/api/health`, { timeout: 5000 });
      flaskStatus = 'connected';
    } catch (e) {
      flaskStatus = 'disconnected';
      status: 'OK', 
      database: 'connected',
      flask: flaskStatus,
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    res.status(500).json({ status: 'ERROR', error: error.message });
    message: 'RSS Aggregator v2.3 - Node.js + Flask IA',
    status: 'running',
    architecture: 'Node.js (frontend/RSS) + Flask (IA analysis)',
    endpoints: {
      local: ['/api/articles', '/api/feeds', '/api/themes', '/api/refresh'],
      flask_proxy: ['/api/metrics', '/api/sentiment/stats', '/api/analyze', '/api/geopolitical/*', '/api/learning-stats']
// ============ DÉMARRAGE ============
async function startServer() {
    await initializeDatabase();
    console.log('✅ Base de données initialisée');
    // Premier refresh après 5s
    setTimeout(async () => {
    }, 5000);
    // Refresh auto toutes les 30min
    setInterval(async () => {
    }, 30 * 60 * 1000);
    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════');
      console.log('🚀 RSS Aggregator v2.3 - DÉMARRÉ');
      console.log(`📡 Node.js: http://0.0.0.0:${PORT}`);
      console.log(`🧠 Flask IA: ${FLASK_API_URL}`);
      console.log(`🔄 Auto-refresh: 30 minutes`);
      console.log('═══════════════════════════════════════');
    console.error('❌ Erreur démarrage:', error);
    process.exit(1);
startServer();