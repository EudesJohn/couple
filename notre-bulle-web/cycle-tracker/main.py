# ============================================================
# Cycle Tracker — Serveur FastAPI
# Notre Bulle — Python
# ============================================================
import os
import uuid
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predictor import predict_full

# === Configuration ===

app = FastAPI(
    title="Notre Bulle — Cycle Tracker",
    description="API de prédiction menstruelle pour le couple",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En prod, restreindre à l'origine de l'app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Modèles Pydantic ===


class CycleEntryIn(BaseModel):
    """Entrée de cycle envoyée depuis le frontend."""
    profile_id: str
    event_date: str  # YYYY-MM-DD
    event_type: str = "period"  # period, symptom, note
    notes: Optional[str] = None


class CycleEntryOut(BaseModel):
    """Entrée de cycle retournée par l'API."""
    id: str
    profile_id: str
    event_date: str
    event_type: str
    notes: Optional[str] = None
    created_at: str


class PredictionRequest(BaseModel):
    """Requête de prédiction."""
    entries: List[CycleEntryIn]
    period_length: int = 5
    num_predictions: int = 3


# === Stockage en mémoire (démo / dev) ===
# En production, remplacez par Supabase PostgreSQL

entries_db: List[Dict[str, Any]] = []


# === Endpoints API ===


@app.get("/")
def root():
    return {
        "service": "Cycle Tracker — Notre Bulle",
        "version": "1.0.0",
        "status": "ok",
    }


@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ─── Entrées de cycle ───


@app.post("/api/entries", response_model=CycleEntryOut)
def create_entry(entry: CycleEntryIn):
    """Ajoute une entrée de cycle (jour de règles marqué)."""
    entry_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    new_entry = {
        "id": entry_id,
        "profile_id": entry.profile_id,
        "event_date": entry.event_date,
        "event_type": entry.event_type,
        "notes": entry.notes,
        "created_at": now,
    }
    entries_db.append(new_entry)

    return new_entry


@app.get("/api/entries", response_model=List[CycleEntryOut])
def list_entries(
    profile_id: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
):
    """Liste les entrées de cycle, optionnellement filtrées par profil."""
    filtered = entries_db
    if profile_id:
        filtered = [e for e in filtered if e["profile_id"] == profile_id]

    return sorted(filtered, key=lambda e: e["event_date"], reverse=True)[:limit]


@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: str):
    """Supprime une entrée de cycle."""
    global entries_db
    before = len(entries_db)
    entries_db = [e for e in entries_db if e["id"] != entry_id]
    if len(entries_db) == before:
        raise HTTPException(status_code=404, detail="Entrée non trouvée")
    return {"status": "deleted", "id": entry_id}


# ─── Prédictions ───


@app.post("/api/predict")
def predict_cycle(request: PredictionRequest):
    """Génère les prédictions de cycle à partir des entrées marquées."""
    entries = [e.model_dump() for e in request.entries]
    result = predict_full(
        entries=entries,
        period_length=request.period_length,
        num_predictions=request.num_predictions,
    )
    return result


@app.post("/api/predict/from-db")
def predict_from_db(
    profile_id: str = Query(...),
    period_length: int = Query(5),
    num_predictions: int = Query(3),
):
    """Prédit à partir des entrées stockées en mémoire.

    Note: En production, lire depuis Supabase directement.
    """
    entries = [e for e in entries_db if e["profile_id"] == profile_id]
    result = predict_full(
        entries=entries,
        period_length=period_length,
        num_predictions=num_predictions,
    )
    return result


# ─── Initialisation avec données de démonstration ───


@app.post("/api/demo/seed")
def seed_demo_data():
    """Ajoute des données de démonstration pour tester."""
    demo_profile = "demo-couple"
    # 4 cycles de ~28 jours
    base = date.today() - timedelta(days=120)
    periods = [
        base,
        base + timedelta(days=27),
        base + timedelta(days=56),
        base + timedelta(days=83),
    ]
    for p in periods:
        for i in range(5):  # 5 jours de règles
            entries_db.append({
                "id": str(uuid.uuid4()),
                "profile_id": demo_profile,
                "event_date": (p + timedelta(days=i)).isoformat(),
                "event_type": "period",
                "notes": None,
                "created_at": datetime.utcnow().isoformat(),
            })
    return {
        "status": "seeded",
        "count": len(periods) * 5,
        "profile_id": demo_profile,
    }
