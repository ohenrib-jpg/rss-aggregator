# modules/email_sender.py
import smtplib
import os
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import logging

logger = logging.getLogger("rss-aggregator")

class EmailSender:
    def __init__(self):
        self.config_file = "email_config.json"
        self.load_config()
    
    def load_config(self):
        """Charge la configuration email"""
        default_config = {
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "smtp_user": "",
            "smtp_pass": "",
            "smtp_secure": True,
            "enabled": False,
            "recipients": [],
            "schedule": "daily"  # daily, weekly, monthly
        }
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self.config = {**default_config, **json.load(f)}
            else:
                self.config = default_config
        except Exception as e:
            logger.error(f"Erreur chargement config email: {e}")
            self.config = default_config
    
    def save_config(self, config):
        """Sauvegarde la configuration"""
        try:
            self.config = config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Erreur sauvegarde config email: {e}")
            return False
    
    def test_connection(self):
        """Teste la connexion SMTP"""
        if not self.config['enabled']:
            return False, "Email désactivé"
        
        try:
            server = smtplib.SMTP(self.config['smtp_host'], self.config['smtp_port'])
            if self.config['smtp_secure']:
                server.starttls()
            
            if self.config['smtp_user'] and self.config['smtp_pass']:
                server.login(self.config['smtp_user'], self.config['smtp_pass'])
            
            server.quit()
            return True, "Connexion SMTP réussie"
        except Exception as e:
            return False, f"Erreur SMTP: {str(e)}"
    
    def send_analysis_report(self, report_data, subject="Rapport d'analyse géopolitique"):
        """Envoie un rapport par email"""
        if not self.config['enabled'] or not self.config['recipients']:
            return False, "Email non configuré"
        
        try:
            # Construction du message
            msg = MIMEMultipart()
            msg['From'] = self.config['smtp_user']
            msg['To'] = ", ".join(self.config['recipients'])
            msg['Subject'] = f"{subject} - {datetime.now().strftime('%d/%m/%Y')}"
            
            # Corps HTML du email
            html_content = self._generate_email_html(report_data)
            msg.attach(MIMEText(html_content, 'html'))
            
            # Envoi
            server = smtplib.SMTP(self.config['smtp_host'], self.config['smtp_port'])
            if self.config['smtp_secure']:
                server.starttls()
            server.login(self.config['smtp_user'], self.config['smtp_pass'])
            
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Rapport envoyé à {len(self.config['recipients'])} destinataires")
            return True, "Rapport envoyé avec succès"
            
        except Exception as e:
            logger.error(f"Erreur envoi email: {e}")
            return False, f"Erreur envoi: {str(e)}"
    
    def _generate_email_html(self, report_data):
        """Génère le contenu HTML du email"""
        return f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .header {{ background: #1e40af; color: white; padding: 20px; border-radius: 10px; }}
                .metric {{ background: #f8fafc; padding: 15px; margin: 10px 0; border-radius: 8px; }}
                .alert {{ background: #fef3c7; padding: 10px; border-left: 4px solid #f59e0b; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 Rapport d'Analyse Géopolitique</h1>
                <p>Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}</p>
            </div>
            
            <div class="metric">
                <h3>📈 Statistiques Globales</h3>
                <p>Articles analysés: <strong>{report_data.get('total_articles', 0)}</strong></p>
                <p>Thèmes détectés: <strong>{report_data.get('total_themes', 0)}</strong></p>
                <p>Confiance moyenne: <strong>{report_data.get('avg_confidence', 0)*100:.1f}%</strong></p>
            </div>
            
            <div class="metric">
                <h3>🎨 Thèmes Principaux</h3>
                {''.join([f'<span style="background: #e2e8f0; padding: 5px 10px; margin: 2px; border-radius: 15px; display: inline-block;">{theme}</span>' 
                         for theme in report_data.get('top_themes', [])[:10]])}
            </div>
            
            <div class="alert">
                <strong>💡 Insights:</strong> Cette analyse a été générée automatiquement par votre système IA local.
            </div>
            
            <p><em>Rapport généré automatiquement par RSS Aggregator</em></p>
        </body>
        </html>
        """

# Instance globale
email_sender = EmailSender()