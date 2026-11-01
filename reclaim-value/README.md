# Reclaim Value – AI-Powered Circular Marketplace for Construction Material Recovery

3-tier architecture + AI microservice:

| Tier | Stack | Folder | Port |
|---|---|---|---|
| Presentation | React + Vite + Tailwind | `frontend/` | 5173 |
| API gateway | Node.js + Express + MongoDB (JWT, bcrypt, RBAC) | `backend/` | 5000 |
| AI microservice | Python + FastAPI (YOLO, price model, recommender, NLP parser, agent) | `ai-service/` | 8000 |

## Quick start
```bash
# 1. AI service
cd ai-service && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# optional real YOLO: pip install ultralytics, then set YOLO_WEIGHTS=path/to/best.pt

# 2. Backend (needs MongoDB, local or Atlas)
cd backend && cp .env.example .env && npm install && npm run dev

# 3. Frontend
cd frontend && npm install && npm run dev
```
Open http://localhost:5173, register as **Company** (supplier) and **Buyer** (use two browsers), then:
upload photo → AI analysis → save to inventory → publish listing → buyer searches in natural language → request → company accepts.

### AI-powered inventory assistant
The Company dashboard assistant uses the Gemini Developer API. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey), put it in `backend/.env` as `GEMINI_API_KEY=...`, and keep `GEMINI_MODEL` set to a model available to your key (the current default is `gemini-3.1-flash-lite`). To discover and actually test an available text-generation model from PowerShell:

```powershell
Set-Location .\backend
npm run test:gemini
```

The check lists models available to that key and sends a tiny test prompt to up to five candidates, stopping at the first successful response. To test a specific model, run `node .\scripts\test-gemini.js gemini-model-name`. Put the printed working model in `GEMINI_MODEL` in `.env`, then restart the backend. Free-tier availability and quotas depend on model, account, and region; Google may use content from unpaid services to improve its products, so do not send sensitive data on the free tier.

Never put API keys in frontend code or commit them. Recent chat messages are sent to Gemini as context. Chat intent and account actions run locally in the backend without depending on the AI microservice. The assistant has a product guide covering roles, workflows, model limitations, price/CO₂ estimates, demo listings, and available inventory actions. Built-in guide answers still work if Gemini cannot be reached. General answers cannot see live inventory or execute actions; those continue through the existing authenticated backend tools.

### Optional demo marketplace data
To add 50 clearly marked sample listings to the MongoDB database configured in `backend/.env`, open PowerShell:
```powershell
cd backend
npm run seed:demo
```
The command is safe to rerun: it keeps existing records and fills the demo supplier's active sample listings up to 50. Start the app, sign in as a Buyer or Recycler, and open Marketplace to browse them. Demo listings and prices are generated examples for testing the UI; they are not real inventory, market quotes, or completed sales.

## Modules (from the project deck)
1. AI Material Recognition – `ai-service/vision.py` (YOLO if weights present, colour/rust heuristic fallback)
2. Recommendation Engine – `ai-service/recommend.py` (Reuse/Sell/Recycle/Dispose weighted heuristic + CO₂)
3. Inventory CRUD – `backend/src/routes/materials.js`
4. Marketplace + purchase workflow – `listings.js`, `requests.js`
5. Smart Matching – `backend/src/utils.js` (S = w1·Sim + w2·Dist + w3·Price + w4·Rating)
6. NLP search + AI agent with function calling – `ai-service/nlp.py`, `backend/src/routes/ai.js`
+ ESG analytics – `backend/src/routes/analytics.js`

## Tests
`cd backend && npm test` (Jest/Supertest-style unit tests) · `cd ai-service && pytest`

## Continuous integration
GitHub Actions runs backend tests, the frontend production build, and AI-service compile/tests on every push and pull request. The jobs run independently. CI uses lockfile-based Node installs and Python 3.11; it does not need application credentials, MongoDB, trained model weights, or external AI-provider access.

## Notes / honesty
- Without trained weights the vision step runs in **demo mode** (heuristic), flagged in the API response. Fine-tune YOLO on a construction-materials dataset (steel, concrete, brick, wood, tiles, glass) and set `YOLO_WEIGHTS`.
- To enable trained weights on Windows, set the variable in the same PowerShell window before starting Uvicorn: `$env:YOLO_WEIGHTS = "C:\path\to\ai-service\weights\materials.pt"`. Check `http://localhost:8000/health` for the material model's `loaded` status and any load error. The variable is read at service startup.
- Price model uses a transparent baseline; `ai-service/train_price.py` trains a regression on exported trades when you have data.
- The NLP parser and agent are rule-based by default; No LLM key is required. Swap in a LangChain/LLM chain in `nlp.py` (`parse_query`, `agent_intent`).
- Role access: Company (supply), Buyer/Recycler (demand), Admin (governance).

## Creating an Admin
Admins cannot self-register. Register a normal user, then in `mongosh`:
`db.users.updateOne({email:"you@x.com"},{$set:{role:"Admin"}})`

## API summary
`POST /api/auth/register|login` · `GET/POST/PUT/DELETE /api/materials` (Company) · `POST /api/ai/analyze` (image) · `POST /api/ai/agent`
`POST /api/listings` · `GET /api/listings?nl=…` · `POST /api/requests` · `PATCH /api/requests/:id` · `GET /api/analytics/summary` · `/api/admin/*`

## Training on real data
See `ai-service/TRAINING.md` for dataset links, conversion scripts, YOLO training and price-model training.
