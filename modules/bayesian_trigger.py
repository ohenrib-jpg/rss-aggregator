from flask import Flask, request, jsonify
import os
import logging
import threading
from bayesian_worker import run_batch

app = Flask(__name__)
logger = logging.getLogger("bayes_trigger")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

TOKEN = os.getenv("BAYES_TRIGGER_TOKEN")

def _start_batch_in_thread():
    def _target():
        try:
            logger.info("Démarrage batch bayésien (thread)...")
            run_batch()
            logger.info("Batch bayésien terminé (thread).")
        except Exception:
            logger.exception("Erreur dans le thread batch")
    t = threading.Thread(target=_target, daemon=True)
    t.start()
    return t.ident

@app.route("/run-bayes", methods=["POST"])
def run_bayes():
    auth = request.headers.get("Authorization", "")
    if TOKEN and auth != f"Bearer {TOKEN}":
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    # lancer le traitement en arrière-plan et retourner immédiatement
    try:
        job_id = _start_batch_in_thread()
        return jsonify({"success": True, "message": "Batch déclenché", "job_id": job_id}), 202
    except Exception as e:
        logger.exception("run-bayes error")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "bayes_trigger"}), 200

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)