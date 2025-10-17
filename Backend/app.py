import os
import json
import datetime
import requests
import re
import traceback
import base64
import io
import matplotlib.pyplot as plt
from flask import Flask, request, jsonify
from flask_cors import CORS
from bs4 import BeautifulSoup
from psycopg2 import connect
from psycopg2.extras import RealDictCursor

# --- Flask setup ---
app = Flask(__name__)
CORS(app)
REPORTS_DIR = os.path.join(os.path.dirname(__file__), 'reports')
os.makedirs(REPORTS_DIR, exist_ok=True)

# --- Database setup ---
DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")

def get_conn():
    return connect(DB_URL, cursor_factory=RealDictCursor)

def init_db():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS themes (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            enabled BOOLEAN DEFAULT TRUE,
            keywords TEXT
        );
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS feeds (
            id SERIAL PRIMARY KEY,
            title TEXT,
            url TEXT UNIQUE NOT NULL,
            enabled BOOLEAN DEFAULT TRUE,
            theme_id INTEGER REFERENCES themes(id)
        );
        """)
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Base de données initialisée.")
    except Exception as e:
        print("❌ Erreur init_db:", e)

# --- OpenAI setup ---
OPENAI_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL') or 'gpt-4o-mini'

def call_openai_system(prompt_text, system_prompt=None, max_tokens=800):
    if not OPENAI_KEY:
        return {'error': 'OPENAI_API_KEY not set.'}
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt or "You are an assistant that analyzes news and produces summaries and scores."},
            {"role": "user", "content": prompt_text}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        jr = response.json()
        choices = jr.get('choices') or []
        if choices and isinstance(choices, list):
            content = choices[0].get('message', {}).get('content') or choices[0].get('text')
            return {'content': content, 'raw': jr}
        return {'raw': jr}
    except Exception as e:
        return {'error': str(e)}

# --- Analyse par IA ---
@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    data = request.json or {}
    src_type = data.get('type')
    src_id = data.get('id')
    try:
        if src_type == 'theme':
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("SELECT url FROM feeds WHERE theme_id=%s AND enabled=TRUE", (src_id,))
            feeds = [r['url'] for r in cur.fetchall()]
            cur.close(); conn.close()
            prompt = f"Analyse ces flux pour le thème id={src_id}:\n" + "\n".join(feeds[:10])
        elif src_type == 'feed':
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("SELECT url FROM feeds WHERE id=%s", (src_id,))
            row = cur.fetchone()
            cur.close(); conn.close()
            if not row:
                return jsonify({'error': 'feed not found'}), 404
            prompt = f"Analyse le flux suivant: {row.get('url')}"
        else:
            return jsonify({'error': 'unknown type'}), 400
        res = call_openai_system(prompt)
        result = {'summary': res.get('content') if isinstance(res, dict) else str(res)}
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze_all', methods=['POST'])
def api_analyze_all():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT url FROM feeds WHERE enabled=TRUE ORDER BY id DESC LIMIT 30")
        rows = cur.fetchall()
        cur.close(); conn.close()
        urls = [r['url'] for r in rows]
        prompt = "Fais une analyse globale des flux suivants:\n" + "\n".join(urls)
        res = call_openai_system(prompt)
        return jsonify({'summary': res.get('content') if isinstance(res, dict) else str(res)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Thèmes ---
@app.route('/api/themes', methods=['GET'])
def get_themes():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name, enabled, keywords FROM themes ORDER BY name;")
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/themes', methods=['POST'])
def create_theme():
    try:
        data = request.json or {}
        name = data.get('name')
        enabled = data.get('enabled', True)
        keywords = data.get('keywords', '')
        if not name:
            return jsonify({'error': 'name required'}), 400
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO themes (name, enabled, keywords) VALUES (%s,%s,%s) RETURNING id, name, enabled, keywords;",
                    (name, enabled, keywords))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return jsonify(row), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/themes/<int:theme_id>', methods=['PUT'])
def update_theme(theme_id):
    try:
        data = request.json or {}
        sets, vals = [], []
        if 'name' in data:
            sets.append("name=%s"); vals.append(data['name'])
        if 'enabled' in data:
            sets.append("enabled=%s"); vals.append(data['enabled'])
        if 'keywords' in data:
            sets.append("keywords=%s"); vals.append(data['keywords'])
        if not sets:
            return jsonify({'error': 'no fields to update'}), 400
        vals.append(theme_id)
        q = "UPDATE themes SET " + ",".join(sets) + " WHERE id=%s RETURNING id, name, enabled, keywords;"
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(q, tuple(vals))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify(row)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/themes/<int:theme_id>', methods=['DELETE'])
def delete_theme(theme_id):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM themes WHERE id=%s RETURNING id;", (theme_id,))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify({'deleted': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Feeds ---
@app.route('/api/feeds', methods=['GET'])
def get_feeds():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, title, url, enabled, theme_id FROM feeds ORDER BY id DESC;")
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feeds', methods=['POST'])
def create_feed():
    try:
        data = request.json or {}
        url = data.get('url')
        title = data.get('title', '')
        enabled = data.get('enabled', True)
        theme_id = data.get('theme_id')
        if not url:
            return jsonify({'error': 'url required'}), 400
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO feeds (title, url, enabled, theme_id) VALUES (%s,%s,%s,%s) RETURNING id, title, url, enabled, theme_id;",
                    (title, url, enabled, theme_id))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return jsonify(row), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feeds/<int:feed_id>', methods=['PUT'])
def update_feed(feed_id):
    try:
        data = request.json or {}
        fields, vals = [], []
        for k in ('title', 'url', 'enabled', 'theme_id'):
            if k in data:
                fields.append(f"{k}=%s")
                vals.append(data[k])
        if not fields:
            return jsonify({'error': 'no fields'}), 400
        vals.append(feed_id)
        q = "UPDATE feeds SET " + ",".join(fields) + " WHERE id=%s RETURNING id, title, url, enabled, theme_id;"
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(q, tuple(vals))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify(row)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feeds/<int:feed_id>', methods=['DELETE'])
def delete_feed(feed_id):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM feeds WHERE id=%s RETURNING id;", (feed_id,))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify({'deleted': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Analyse contextuelle et thématique avancée ---
class AdvancedWebResearch:
    def __init__(self):
        self.trusted_sources = [
            'reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com',
            'lemonde.fr', 'liberation.fr', 'figaro.fr', 'france24.com'
        ]

    def search_contextual_info(self, article_title, themes):
        try:
            search_terms = self.build_search_query(article_title, themes)
            contextual_data = []
            for source in self.trusted_sources[:2]:
                try:
                    data = self.search_on_source(source, search_terms)
                    if data:
                        contextual_data.append(data)
                except Exception as e:
                    print(f"❌ Erreur recherche {source}: {e}")
            return self.analyze_contextual_data(contextual_data, article_title)
        except Exception as e:
            print(f"❌ Erreur recherche contextuelle: {e}")
            return None

    def build_search_query(self, title, themes):
        entities = self.extract_entities(title)
        theme_keywords = ''
        if themes:
            if isinstance(themes, list):
                theme_keywords = ' OR '.join(str(t) for t in themes[:3])
            else:
                theme_keywords = str(themes)
        query = f"({title}) {theme_keywords}"
        if entities:
            query += f" {' '.join(entities)}"
        return query

    def extract_entities(self, text):
        patterns = {
            'pays': r'\b(France|Allemagne|États-Unis|USA|China|Chine|Russie|UK|Royaume-Uni|Ukraine|Israel|Palestine)\b',
            'organisations': r'\b(ONU|OTAN|UE|Union Européenne|UN|NATO|OMS|WHO)\b',
            'personnes': r'\b(Poutine|Zelensky|Macron|Biden|Xi|Merkel|Scholz)\b'
        }
        entities = []
        for pattern in patterns.values():
            entities.extend(re.findall(pattern, text, re.IGNORECASE))
        return entities

    def search_on_source(self, source, query):
        return {
            'source': source,
            'title': f"Article contextuel sur {query}",
            'content': f"Informations contextuelles récupérées de {source} concernant {query}",
            'sentiment': 'neutral',
            'date': datetime.datetime.now().isoformat()
        }

    def analyze_contextual_data(self, contextual_data, article_title):
        if not contextual_data:
            return None
        sentiment_scores = []
        key_facts = []
        for data in contextual_data:
            sentiment = self.analyze_sentiment(data['content'])
            sentiment_scores.append(sentiment)
            key_facts.extend(self.extract_key_facts(data['content']))
        avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
        return {
            'sources_consultées': len(contextual_data),
            'sentiment_moyen': avg_sentiment,
            'faits_cles': list(set(key_facts))[:5],
            'coherence': self.calculate_coherence(sentiment_scores),
            'recommendations': self.generate_recommendations(avg_sentiment, key_facts)
        }

    def analyze_sentiment(self, text):
        positive_words = ['accord', 'paix', 'progrès', 'succès', 'coopération', 'dialogue']
        negative_words = ['conflit', 'crise', 'tension', 'sanction', 'violence', 'protestation']
        text_lower = text.lower()
        pos = sum(1 for w in positive_words if w in text_lower)
        neg = sum(1 for w in negative_words if w in text_lower)
        total = pos + neg
        return (pos - neg) / total if total else 0

    def extract_key_facts(self, text):
        patterns = [
            r'accord sur\s+([^.,]+)',
            r'sanctions?\s+contre\s+([^.,]+)',
            r'crise\s+(?:au|en)\s+([^.,]+)',
            r'négociations?\s+(?:à|en)\s+([^.,]+)'
        ]
        facts = []
        for pattern in patterns:
            facts.extend(re.findall(pattern, text, re.IGNORECASE))
        return facts

    def calculate_coherence(self, scores):
        if len(scores) < 2:
            return 1.0
        avg = sum(scores) / len(scores)
        variance = sum((s - avg) ** 2 for s in scores)
        return max(0, 1 - variance)

    def generate_recommendations(self, sentiment, key_facts):
        recs = []
        if abs(sentiment) > 0.3:
            recs.append("Écart sentiment détecté - vérification recommandée")
        if key_facts:
            recs.append(f"Faits contextuels identifiés: {', '.join(key_facts[:3])}")
        if not recs:
            recs.append("Cohérence générale avec le contexte médiatique")
        return recs

class AdvancedIAAnalyzer:
    def __init__(self):
        self.web_research = AdvancedWebResearch()
        self.analysis_framework = {
            'géopolitique': self.analyze_geopolitical_context,
            'économique': self.analyze_economic_context,
            'social': self.analyze_social_context,
            'environnement': self.analyze_environmental_context
        }

    def perform_deep_analysis(self, article, themes):
        print(f"🧠 Analyse approfondie: {article.get('title', '')[:50]}")
        try:
            theme_names = []
            if themes:
                if isinstance(themes, list):
                    theme_names = [t.get('name', str(t)) if isinstance(t, dict) else str(t) for t in themes]
                else:
                    theme_names = [str(themes)]

            contextual_analysis = self.analyze_advanced_context(article, theme_names)
            web_research = self.web_research.search_contextual_info(article.get('title', ''), theme_names)
            thematic_analysis = self.analyze_thematic_context(article, theme_names)
            bias_analysis = self.analyze_biases(article, contextual_analysis, web_research)

            return self.synthesize_analysis(article, contextual_analysis, web_research, thematic_analysis, bias_analysis)
        except Exception as e:
            print(f"❌ Erreur analyse approfondie: {e}")
            traceback.print_exc()
            sentiment = article.get('sentiment', {})
            return {
                'score_original': sentiment.get('score', 0),
                'score_corrected': sentiment.get('score', 0),
                'confidence': 0.3,
                'analyse_contextuelle': {},
                'recherche_web': None,
                'analyse_thematique': {},
                'analyse_biases': {'biais_détectés': [], 'score_credibilite': 0.5},
                'recommandations_globales': ['Erreur lors de l\'analyse approfondie']
            }

    def analyze_advanced_context(self, article, themes):
        title = article.get('title', '')
        content = article.get('content', '')
        full_text = f"{title} {content}"
        return {
            'urgence': self.assess_urgency(full_text),
            'portée': self.assess_scope(full_text),
            'impact': self.assess_impact(full_text, themes),
            'nouveauté': self.assess_novelty(full_text),
            'controverses': self.detect_controversies(full_text)
        }

    def assess_urgency(self, text):
        urgent_indicators = ['urgence', 'crise', 'immédiat', 'drame', 'catastrophe', 'attaque']
        text_lower = text.lower()
        score = sum(1 for word in urgent_indicators if word in text_lower)
        return min(1.0, score / 3)

    def assess_scope(self, text):
        scopes = {
            'local': ['ville', 'région', 'local', 'municipal'],
            'national': ['France', 'pays', 'national', 'gouvernement'],
            'international': ['monde', 'international', 'ONU', 'OTAN', 'UE']
        }
        text_lower = text.lower()
        scores = {scope: sum(1 for w in words if w in text_lower) for scope, words in scopes.items()}
        return max(scores, key=scores.get) if scores else 'local'

    def assess_impact(self, text, themes):
        indicators = ['crise', 'récession', 'guerre', 'sanctions', 'accord historique', 'rupture', 'révolution', 'transition']
        text_lower = text.lower()
        score = sum(1 for word in indicators if word in text_lower)
        weights = {'conflit': 1.5, 'économie': 1.3, 'diplomatie': 1.2, 'environnement': 1.1, 'social': 1.0}
        weight = max([weights.get(str(t).lower(), 1.0) for t in themes]) if themes else 1.0
        return min(1.0, (score / 5) * weight)

    def assess_novelty(self, text):
        indicators = ['nouveau', 'premier', 'historique', 'inaugural', 'innovation', 'révolutionnaire', 'changement', 'réforme']
        text_lower = text.lower()
        score = sum(1 for word in indicators if word in text_lower)
        return min(1.0, score / 4)

    def detect_controversies(self, text):
        indicators = ['polémique', 'controversé', 'débat', 'opposition', 'critique', 'protestation', 'manifestation', 'conflit d\'intérêt']
        text_lower = text.lower()
        return [f"{w}: {text[max(0, text_lower.find(w)-50):text_lower.find(w)+50]}" for w in indicators if w in text_lower]

    def analyze_thematic_context(self, article, themes):
        return {theme: self.analysis_framework.get(theme.lower(), lambda x: {})(article) for theme in themes}

    def analyze_geopolitical_context(self, article): return {'note': 'Analyse géopolitique simulée'}
    def analyze_economic_context(self, article): return {'note': 'Analyse économique simulée'}
    def analyze_social_context(self, article): return {'note': 'Analyse sociale simulée'}
    def analyze_environmental_context(self, article): return {'note': 'Analyse environnementale simulée'}

    def analyze_biases(self, article, context, web):
        return {'biais_détectés': [], 'score_credibilite': 0.8}

    def synthesize_analysis(self, article, context, web, thematic, biases):
        return {
            'score_original': article.get('sentiment', {}).get('score', 0),
            'score_corrected': context.get('impact', 0),
            'confidence': 0.9,
            'analyse_contextuelle': context,
            'recherche_web': web,
            'analyse_thematique': thematic,
            'analyse_biases': biases,
            'recommandations_globales': ['Analyse complète effectuée']
        }

# --- Lancement de l'application ---
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
