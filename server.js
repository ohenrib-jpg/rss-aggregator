const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

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

// Servir les fichiers statiques depuis le dossier public
app.use(express.static('public'));

// Fichiers de configuration
const CONFIG_FILE = path.join(__dirname, 'config.json');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const SENTIMENT_LEXICON_FILE = path.join(__dirname, 'sentiment-lexicon.json');

// Ping Render
const http = require("http");

setInterval(() => {
  http.get("https://rss-aggregator-l7qj.onrender.com/");
  console.log("Ping envoyé");
}, 2 * 60 * 1000); // Toutes les 2 minutes


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
  }
  if (!fs.existsSync(THEMES_FILE)) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify({ themes: [] }, null, 2));
  }
  if (!fs.existsSync(SENTIMENT_LEXICON_FILE)) {
    initializeSentimentLexicon();
  }
}

// Initialiser le lexique de sentiment
function initializeSentimentLexicon() {
  const initialLexicon = {
    words: {
      // Mots positifs avec pondérations
      'excellent': 2.0, 'exceptionnel': 2.0, 'remarquable': 2.0, 'formidable': 2.0,
      'parfait': 2.0, 'idéal': 2.0, 'sublime': 2.0, 'magnifique': 2.0,
      'génial': 1.8, 'fantastique': 1.8, 'incroyable': 1.8, 'merveilleux': 1.8,
      'superbe': 1.8, 'prodige': 1.8, 'miracle': 1.8, 'phénoménal': 1.8,
      
      'bon': 1.0, 'bien': 1.0, 'agréable': 1.0, 'positif': 1.0,
      'succès': 1.0, 'réussite': 1.0, 'progrès': 1.0, 'victoire': 1.0,
      'avancée': 1.0, 'amélioration': 1.0, 'innovation': 1.0, 'créatif': 1.0,
     
      'correct': 0.5, 'acceptable': 0.5, 'satisfaisant': 0.5, 'convenable': 0.5,
      'passable': 0.3, 'moyen': 0.2, 'standard': 0.1,

      // NOUVEAUX MOTS GÉOPOLITIQUES POSITIFS
      'paix': 1.8, 'accord': 1.5, 'traité': 1.5, 'alliance': 1.3,
      'coopération': 1.5, 'dialogue': 1.2, 'négociation': 1.0, 'diplomatie': 1.2,
      'réconciliation': 1.8, 'cessez-le-feu': 1.5, 'résolution': 1.3,
      'entente': 1.4, 'partenariat': 1.2, 'solidarité': 1.5, 'aide': 1.0,
      'soutien': 1.0, 'espoir': 1.3, 'stabilité': 1.3, 'sécurité': 1.2,
      'libération': 1.5, 'démocratie': 1.2, 'liberté': 1.5, 'justice': 1.3,
      'développement': 1.0, 'reconstruction': 1.2, 'relance': 1.1,
      'croissance': 1.0, 'reprise': 1.1, 'investissement': 0.8,

      // Mots négatifs avec pondérations
      'catastrophe': -2.0, 'désastre': -2.0, 'horrible': -2.0, 'épouvantable': -2.0,
      'terrible': -2.0, 'abominable': -2.0, 'exécrable': -2.0, 'atroce': -2.0,
      'affreux': -1.8, 'détestable': -1.8, 'ignoble': -1.8, 'infâme': -1.8,
      'odieux': -1.8, 'méprisable': -1.8, 'haïssable': -1.8, 'immonde': -1.8,
      
      'mauvais': -1.0, 'négatif': -1.0, 'problème': -1.0, 'échec': -1.0,
      'difficile': -1.0, 'compliqué': -1.0, 'crise': -1.0, 'danger': -1.0,
      'risque': -1.0, 'menace': -1.0, 'échec': -1.0, 'défaite': -1.0,
      
      'décevant': -0.7, 'médiocre': -0.7, 'insuffisant': -0.7, 'faible': -0.7,
      'limité': -0.5, 'incomplet': -0.5, 'imparfait': -0.3, 'perfectible': -0.2,

      // NOUVEAUX MOTS GÉOPOLITIQUES NÉGATIFS
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
      'impasse': -1.4, 'échec': -1.3, 'stagnation': -1.1
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
    
    // Assurer que chaque thème a une couleur
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

// SYSTÈME D'APPRENTISSAGE AUTOMATIQUE AMÉLIORÉ AVEC CORRECTIONS
class SelfLearningSentiment {
  constructor() {
    this.lexicon = loadSentimentLexicon();
    this.negations = ['pas', 'non', 'ne', 'ni', 'aucun', 'rien', 'jamais', 'sans'];
    this.intensifiers = {
      'très': 1.5, 'extrêmement': 2.0, 'vraiment': 1.3, 'particulièrement': 1.4,
      'fortement': 1.6, 'totalement': 1.7, 'complètement': 1.7, 'absolument': 1.8
    };
    this.attenuators = {
      'peu': 0.5, 'légèrement': 0.6, 'modérément': 0.7, 'relativement': 0.8,
      'assez': 0.9, 'plutôt': 0.8, 'quelque': 0.7
    };
  }

  analyze(text) {
    if (!text || text.length < 5) {
      return { score: 0, sentiment: 'neutral', confidence: 0.05 };
    }

    const words = this.preprocessText(text);
    let totalScore = 0;
    let wordCount = 0;
    let confidence = 0;
    const wordScores = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = this.getWordScore(word);
      let modifier = 1.0;

      // Vérifier les négations
      if (i > 0 && this.negations.includes(words[i-1])) {
        modifier *= -1.5; // Inversion accentuée
      }

      // Vérifier les intensificateurs
      if (i > 0 && this.intensifiers[words[i-1]]) {
        modifier *= this.intensifiers[words[i-1]];
      }

      // Vérifier les atténuateurs
      if (i > 0 && this.attenuators[words[i-1]]) {
        modifier *= this.attenuators[words[i-1]];
      }

      const finalScore = wordScore * modifier;
      
      if (wordScore !== 0) {
        totalScore += finalScore;
        wordCount++;
        
        // Calculer la confiance pour ce mot
        const wordConfidence = this.calculateWordConfidence(word);
        confidence += wordConfidence;
        
        wordScores.push({
          word: word,
          baseScore: wordScore,
          finalScore: finalScore,
          confidence: wordConfidence,
          modifier: modifier
        });
      }
    }

    // Score normalisé
    const normalizedScore = wordCount > 0 ? totalScore / wordCount : 0;
    
    // Confiance moyenne
    const averageConfidence = wordCount > 0 ? confidence / wordCount : 0.1;

    // CORRECTION : Utiliser la nouvelle méthode de détermination du sentiment
    const sentimentResult = this.determineSentiment(normalizedScore, wordScores);

    // Mettre à jour les statistiques d'usage
    this.updateUsageStats(wordScores, normalizedScore);

    return {
      score: Math.round(normalizedScore * 100) / 100,
      sentiment: sentimentResult.sentiment,
      confidence: Math.round(averageConfidence * 100) / 100,
      wordCount: wordCount,
      words: wordScores,
      emotionalIntensity: sentimentResult.emotionalIntensity
    };
  }

  // NOUVELLE MÉTHODE : Détermination améliorée du sentiment
  determineSentiment(normalizedScore, wordScores) {
    const emotionalIntensity = this.calculateEmotionalIntensity(wordScores);
    
    // Ajuster les seuils en fonction de l'intensité émotionnelle
    let positiveThreshold = 0.08; // Réduit de 0.15 à 0.08
    let negativeThreshold = -0.08; // Réduit de -0.15 à -0.08
    
    if (emotionalIntensity > 0.7) {
      // Texte très émotionnel - seuils plus stricts
      positiveThreshold = 0.15;
      negativeThreshold = -0.15;
    } else if (emotionalIntensity < 0.3) {
      // Texte peu émotionnel - seuils plus larges
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

  // NOUVELLE MÉTHODE : Calcul de l'intensité émotionnelle
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
    if (!stats) return 0.5; // Confiance moyenne pour les nouveaux mots
    
    const usageCount = stats.usageCount || 0;
    const consistency = stats.consistency || 0.5;
    
    // Plus un mot est utilisé et cohérent, plus la confiance est élevée
    return Math.min(0.95, 0.5 + (usageCount * 0.05) + (consistency * 0.3));
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

      // Si le mot n'est pas dans le lexique, apprendre de son usage
      if (baseScore === 0 && stats.usageCount > 3) {
        // Le mot apparaît régulièrement, lui attribuer un score basé sur le contexte
        const learnedScore = overallScore * 0.3; // Apprentissage conservateur
        this.lexicon.words[word] = Math.max(-1, Math.min(1, learnedScore));
        lexiconUpdated = true;
        console.log(`📚 Nouveau mot appris: "${word}" -> ${this.lexicon.words[word]}`);
      }

      // Ajuster le score existant basé sur l'usage
      if (baseScore !== 0 && stats.usageCount > 10) {
        const targetScore = overallScore * 0.7 + baseScore * 0.3;
        const adjustment = (targetScore - baseScore) * this.lexicon.learningRate;
        this.lexicon.words[word] = Math.max(-2, Math.min(2, baseScore + adjustment));
        lexiconUpdated = true;
        
        // Mettre à jour la cohérence
        const scoreDiff = Math.abs(finalScore - overallScore);
        stats.consistency = 0.9 * stats.consistency + 0.1 * (1 - scoreDiff);
      }
    });

    if (lexiconUpdated) {
      saveSentimentLexicon(this.lexicon);
    }
  }

  // Méthode pour forcer l'apprentissage à partir de corrections manuelles
  learnFromCorrection(text, expectedScore) {
    const analysis = this.analyze(text);
    const error = expectedScore - analysis.score;
    
    if (Math.abs(error) > 0.2) { // Seuil d'apprentissage
      const words = this.preprocessText(text);
      
      words.forEach(word => {
        if (this.lexicon.words[word] !== undefined) {
          // Ajustement plus agressif pour les corrections manuelles
          this.lexicon.words[word] += error * this.lexicon.learningRate * 2;
          this.lexicon.words[word] = Math.max(-2, Math.min(2, this.lexicon.words[word]));
        }
      });
      
      saveSentimentLexicon(this.lexicon);
      console.log(`🎓 Correction appliquée: "${text.substring(0, 50)}..."`);
    }
  }

  // Obtenir des statistiques sur l'apprentissage
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
  
  // Initialiser la matrice de corrélation
  themeNames.forEach(theme1 => {
    correlations[theme1] = {};
    themeNames.forEach(theme2 => {
      correlations[theme1][theme2] = 0;
    });
  });
  
  // Compter les co-occurrences
  articles.forEach(article => {
    const content = (article.title + ' ' + article.content).toLowerCase();
    const matchingThemes = themes.filter(theme => 
      theme.keywords.some(keyword => content.includes(keyword.toLowerCase()))
    ).map(theme => theme.name);
    
    // Mettre à jour les corrélations pour chaque paire de thèmes
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
      growth = 100; // Nouveau thème apparu
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
    const month = date.substring(0, 7); // Format YYYY-MM
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

// Fonction d'analyse des articles par thème - CORRIGÉE
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

  // Initialiser les thèmes
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

  // CORRECTION : Analyser chaque article (AVANT le filtrage par thème)
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

    // ✅ CORRECTION MAJEURE: Analyse de sentiment POUR TOUS LES ARTICLES
    const fullText = article.title + ' ' + (article.content || '');
    const sentimentResult = sentimentAnalyzer.analyze(fullText);
    article.sentiment = sentimentResult;

    // Ensuite, filtrer par thèmes
    themes.forEach(theme => {
      const hasKeyword = theme.keywords.some(keyword => 
        content.includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        analysis.themes[theme.name].count++;
        analysis.themes[theme.name].articles.push(article);
        analysis.timeline[dateKey][theme.name]++;
        
        // Mettre à jour les statistiques de sentiment PAR THÈME
        const themeSentiment = analysis.themes[theme.name].sentiment;
        themeSentiment[sentimentResult.sentiment]++;
        themeSentiment.articles.push({
          title: article.title,
          sentiment: sentimentResult,
          date: article.pubDate,
          link: article.link,
          content: article.content
        });
        
        // Compter les matches par mot-clé
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

  // Calculer les scores moyens de sentiment par thème
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
      
      // Calculer les pourcentages
      sentiment.positivePercent = Math.round((sentiment.positive / totalArticles) * 100);
      sentiment.negativePercent = Math.round((sentiment.negative / totalArticles) * 100);
      sentiment.neutralPercent = Math.round((sentiment.neutral / totalArticles) * 100);
    }
  });

  // Calculer les métriques existantes
  analysis.metrics.keywordEffectiveness = analyzeKeywordEffectiveness(articles, themes);
  analysis.metrics.correlations = analyzeThemeCorrelations(articles, themes);
  analysis.metrics.seasonality = analyzeSeasonality(analysis.timeline);
  
  // Calculer les tendances
  if (analysisHistory.length > 0) {
    const previousAnalysis = analysisHistory[analysisHistory.length - 1];
    analysis.trends = calculateTrends(analysis, previousAnalysis);
  }

  return analysis;
}

// Fonction pour rafraîchir les données
async function refreshData() {
  if (cachedAnalysis.isUpdating) {
    console.log('⚠️  Rafraîchissement déjà en cours...');
    return;
  }

  try {
    cachedAnalysis.isUpdating = true;
    console.log('🔄 Rafraîchissement des flux RSS...');
    
    const config = loadConfig();
    const themes = loadThemes();
    const allArticles = [];

    // Si pas de flux configurés, retourner des données vides
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
        allArticles.push(...articles);
        console.log(`✅ ${articles.length} articles récupérés de ${feed.title || feedUrl}`);
      } catch (error) {
        console.error(`❌ Erreur avec le flux ${feedUrl}:`, error.message);
      }
    }

    // Dédoublonner les articles par ID
    const uniqueArticles = allArticles.filter((article, index, self) =>
      index === self.findIndex(a => a.id === article.id)
    );

    // Sauvegarder l'analyse précédente pour les tendances
    if (cachedAnalysis.analysis && cachedAnalysis.analysis.themes) {
      analysisHistory.push({
        ...cachedAnalysis.analysis,
        timestamp: cachedAnalysis.lastUpdate
      });
      
      // Garder seulement les 10 dernières analyses
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
    console.log(`📈 Tendances calculées pour ${Object.keys(analysis.trends).length} thèmes`);
    console.log(`😊 Analyse de sentiment avec ${learningStats.learnedWords} mots appris`);
    
  } catch (error) {
    console.error('❌ Erreur lors du rafraîchissement:', error);
    cachedAnalysis.isUpdating = false;
  }
}

// Routes API

// Récupérer tous les articles (avec cache)
app.get('/api/articles', async (req, res) => {
  try {
    // Si pas de données en cache ou premier démarrage, rafraîchir
    if (!cachedAnalysis.lastUpdate || cachedAnalysis.articles.length === 0) {
      await refreshData();
    }
    
    res.json({
      articles: cachedAnalysis.articles,
      analysis: cachedAnalysis.analysis,
      lastUpdate: cachedAnalysis.lastUpdate,
      isUpdating: cachedAnalysis.isUpdating
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

// NOUVELLE ROUTE : Apprentissage manuel
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

// NOUVELLE ROUTE : Statistiques d'apprentissage
app.get('/api/sentiment/stats', (req, res) => {
  try {
    const stats = sentimentAnalyzer.getLearningStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Erreur API stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gérer la configuration des flux RSS
app.get('/api/config/feeds', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Erreur API config feeds:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config/feeds', (req, res) => {
  try {
    const { feeds } = req.body;
    const config = loadConfig();
    config.feeds = feeds;
    saveConfig(config);
    
    // Rafraîchir les données après modification
    refreshData();
    
    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (error) {
    console.error('Erreur API config feeds:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gérer les thèmes
app.get('/api/themes', (req, res) => {
  try {
    const themes = loadThemes();
    res.json(themes);
  } catch (error) {
    console.error('Erreur API themes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/themes', (req, res) => {
  try {
    const { themes } = req.body;
    const themesData = { themes };
    saveThemes(themesData);
    
    // Rafraîchir l'analyse après modification
    refreshData();
    
    res.json({ success: true, message: 'Thèmes sauvegardés' });
  } catch (error) {
    console.error('Erreur API themes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour analyser un texte spécifique
app.post('/api/sentiment/analyze', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }
    
    const analysis = sentimentAnalyzer.analyze(text);
    res.json(analysis);
  } catch (error) {
    console.error('Erreur API analyse:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    lastUpdate: cachedAnalysis.lastUpdate,
    totalArticles: cachedAnalysis.articles.length,
    isUpdating: cachedAnalysis.isUpdating
  });
});

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📊 Interface disponible: http://localhost:${PORT}`);
  
  // Initialiser les fichiers de configuration
  initializeConfigFiles();
  
  // Charger les données au démarrage
  refreshData();
  
  // Planifier le rafraîchissement automatique toutes les 15 minutes
  setInterval(refreshData, 15 * 60 * 1000);
});