
RSS Aggregator - Modernized structure (merged EVO2 base + EVO4 safe changes)

Structure:
- backend/   : Flask app and Python modules (from EVO2)
- frontend/  : Node/Express + public JS/CSS (from EVO2 + safe EVO4 changes)
- config/    : configuration files (config.example.json added for IA settings)
- scripts/   : helper scripts (db init, migrations) if present
- README.md  : this file

Notes:
- I merged EVO4 changes conservatively: files containing placeholders ("...", TODO, FIXME) were not blindly overwritten;
  safe non-placeholder lines were appended when possible.
- JS files were cleaned for isolated '...' tokens.
- A config.example.json was created to restore IA configuration keys (hourly weighting, pdf report toggles, etc.).

Next steps to validate locally:
1. Install backend requirements: pip install -r backend/requirements.txt (or create virtualenv)
2. Install frontend: cd frontend && npm install
3. Configure config/config.json based on config/config.example.json and set IA API URL/API_KEY
4. Start backend (Flask) then frontend (Node) and test endpoints /api/health, /api/articles etc.

