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
The Company dashboard assistant supports Hugging Face Inference Providers or Gemini. Set one provider in `backend/.env`, then restart the backend:

**Hugging Face**
1. Create a fine-grained token with Inference Providers permission at [Hugging Face token settings](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained).
2. Set `CHAT_PROVIDER=huggingface`, `HF_TOKEN=hf_...`, and `HF_MODEL=Qwen/Qwen3-4B-Instruct-2507`. Verify the model is currently available to your account in the [Hugging Face Playground](https://huggingface.co/playground); provider availability, access, and billing/credits can vary. A valid token does not include free inference credits automatically.

**Gemini alternative**
Set `CHAT_PROVIDER=gemini`, `GEMINI_API_KEY=...`, and `GEMINI_MODEL=gemini-3.8-flash`.

Never put provider tokens in frontend code or commit them. Recent chat messages are sent to the provider as context. The assistant has a product guide covering roles, workflows, model limitations, price/CO₂ estimates, demo listings, and available inventory actions. Clickable suggested questions and a built-in guide keep common help available if the model API cannot be reached; these responses are labeled separately. General answers cannot see live inventory or execute actions; those continue through the existing authenticated backend tools.

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
