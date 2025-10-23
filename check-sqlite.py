# check-sqlite.py
import sqlite3
import os

def check_sqlite():
    db_path = './data/rss_aggregator.db'
    
    print("🔍 Vérification SQLite...")
    print(f"📁 Chemin: {db_path}")
    
    if os.path.exists(db_path):
        print("✅ Base de données existe")
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Vérifier les tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        print("📊 Tables trouvées:")
        for table in tables:
            print(f"   - {table[0]}")
            
        # Compter les analyses
        cursor.execute("SELECT COUNT(*) FROM analyses")
        count = cursor.fetchone()[0]
        print(f"📈 Analyses dans la base: {count}")
        
        conn.close()
    else:
        print("❌ Base de données n'existe pas encore")
        print("💡 Elle sera créée au premier lancement")

if __name__ == "__main__":
    check_sqlite()