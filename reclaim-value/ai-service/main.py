from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
import vision, recommend as rec, price as pr, nlp

app = FastAPI(title="Reclaim Value AI Service")


class RecIn(BaseModel):
    material: str; condition: str = "B"; quantity_kg: float = 100
    demand_index: float = 0.5; distance_km: float = 10; storage_days: int = 0


class PriceIn(BaseModel):
    material: str; condition: str = "B"; quantity_kg: float = 100; demand_index: float = 0.5; distance_km: float = 10


class TextIn(BaseModel):
    text: str


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    detection = vision.analyze(await file.read())
    if detection["demo_mode"]:
        return {
            "detected": False,
            "source": "heuristic",
            "message": detection["fallback_reason"],
        }
    return {"detected": True, "source": "yolo", **detection}


@app.get("/health")
def health(): return {"ok": True, "models": vision.model_status()}


@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    det = vision.analyze(await image.read())
    r = rec.recommend(det["material"], det["condition"], det["quantity_kg"])
    p = pr.predict_price(det["material"], det["condition"], det["quantity_kg"])
    return {"detection": det, "recommendation": r, "price": p}


@app.post("/recommend")
def recommend(b: RecIn): return rec.recommend(**b.model_dump())


@app.post("/price")
def price(b: PriceIn): return pr.predict_price(**b.model_dump())


@app.post("/parse-query")
def parse(b: TextIn): return {"filters": nlp.parse_query(b.text)}


@app.post("/agent")
def agent(b: TextIn): return nlp.agent_intent(b.text)
