# ============================================================
# Cycle Tracker — API Vercel Serverless (FastAPI)
# Notre Bulle
# ============================================================
import uuid
import os
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predictor import predict_full

# === FastAPI app ===

app = FastAPI(
    title="Notre Bulle — Cycle Tracker API",
    description="API de prédiction menstruelle (Vercel Serverless)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Modèles ===

class CycleEntryIn(BaseModel):
    profile_id: str
    event_date: str
    event_type: str = "period"
    notes: Optional[str] = None

class PredictionRequest(BaseModel):
    entries: List[CycleEntryIn]
    period_length: int = 5
    num_predictions: int = 3

# Stockage mémoire (un seul cycle de vie serverless)
_db: List[Dict[str, Any]] = []

# === Routes ===

@app.get("/")
def root():
    return {
        "service": "Cycle Tracker — Notre Bulle",
        "version": "1.0.0",
        "status": "ok",
    }

@app.get("/api/health")
def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/entries")
def create_entry(entry: CycleEntryIn):
    new_entry = {
        "id": str(uuid.uuid4()),
        "profile_id": entry.profile_id,
        "event_date": entry.event_date,
        "event_type": entry.event_type,
        "notes": entry.notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    _db.append(new_entry)
    return new_entry

@app.post("/api/predict")
def predict_cycle(request: PredictionRequest):
    entries = [e.model_dump() for e in request.entries]
    result = predict_full(
        entries=entries,
        period_length=request.period_length,
        num_predictions=request.num_predictions,
    )
    return result

@app.post("/api/demo/seed")
def seed_demo():
    demo_profile = "demo-couple"
    base = date.today() - timedelta(days=120)
    periods = [
        base,
        base + timedelta(days=27),
        base + timedelta(days=56),
        base + timedelta(days=83),
    ]
    count = 0
    for p in periods:
        for i in range(5):
            _db.append({
                "id": str(uuid.uuid4()),
                "profile_id": demo_profile,
                "event_date": (p + timedelta(days=i)).isoformat(),
                "event_type": "period",
                "notes": None,
                "created_at": datetime.utcnow().isoformat(),
            })
            count += 1
    return {"status": "seeded", "count": count, "profile_id": demo_profile}
