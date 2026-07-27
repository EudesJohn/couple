# ============================================================
# Cycle Tracker + Push Notifications — API Vercel Serverless
# Notre Bulle
# ============================================================
import uuid
import os
import json
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any, Tuple
from statistics import median, stdev

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

# ============================================================
# PRÉDICTEUR DE CYCLE (intégré — pas d'import entre fichiers)
# ============================================================

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5
LUTEAL_PHASE_DAYS = 14
MIN_PERIOD_GAP_DAYS = 5
MAX_CYCLE_LENGTH = 45
MIN_CYCLE_LENGTH = 20


def get_period_dates(entries: List[Dict]) -> List[date]:
    dates = set()
    for e in entries:
        if e.get("event_type") == "period":
            try:
                d = datetime.strptime(e["event_date"], "%Y-%m-%d").date()
                dates.add(d)
            except (ValueError, KeyError):
                continue
    return sorted(dates)


def group_periods(dates: List[date], min_gap: int = MIN_PERIOD_GAP_DAYS) -> List[List[date]]:
    if not dates:
        return []
    groups: List[List[date]] = [[dates[0]]]
    for d in dates[1:]:
        last = groups[-1][-1]
        if (d - last).days <= min_gap:
            groups[-1].append(d)
        else:
            groups.append([d])
    return groups


def get_cycle_lengths(starts: List[date]) -> List[int]:
    if len(starts) < 2:
        return []
    return [(starts[i+1] - starts[i]).days for i in range(len(starts) - 1)]


def filter_cycle_lengths(lengths: List[int]) -> List[int]:
    return [l for l in lengths if MIN_CYCLE_LENGTH <= l <= MAX_CYCLE_LENGTH]


def compute_average_cycle(lengths: List[int]) -> float:
    if not lengths:
        return DEFAULT_CYCLE_LENGTH
    if len(lengths) == 1:
        return float(lengths[0])
    if len(lengths) == 2:
        return float(sum(lengths)) / len(lengths)
    return median(lengths)


def predict_next_period(last_start: date, avg_cycle: float) -> date:
    return last_start + timedelta(days=round(avg_cycle))


def predict_ovulation(next_period_start: date) -> date:
    return next_period_start - timedelta(days=LUTEAL_PHASE_DAYS)


def predict_fertile_window(ovulation_date: date) -> Tuple[date, date]:
    start = ovulation_date - timedelta(days=5)
    end = ovulation_date + timedelta(days=1)
    return start, end


def get_period_days_list(period_start: date, period_length: int = DEFAULT_PERIOD_LENGTH) -> List[date]:
    return [period_start + timedelta(days=i) for i in range(period_length)]


def generate_phase_days(
    period_start: date,
    next_period_start: date,
    ovulation_date: date,
    fertile_start: date,
    fertile_end: date,
    period_length: int = DEFAULT_PERIOD_LENGTH,
) -> List[Dict]:
    days: List[Dict] = []
    current = period_start
    period_days_set = set(get_period_days_list(period_start, period_length))
    while current < next_period_start:
        day_str = current.isoformat()
        if current in period_days_set:
            days.append({"date": day_str, "phase": "period"})
        elif current == ovulation_date:
            days.append({"date": day_str, "phase": "ovulation"})
        elif fertile_start <= current <= fertile_end:
            days.append({"date": day_str, "phase": "fertile"})
        else:
            days.append({"date": day_str, "phase": "normal"})
        current += timedelta(days=1)
    return days


def _build_past_cycles(starts, groups, avg_cycle, period_length):
    cycles = []
    for i, start in enumerate(starts):
        if i + 1 < len(starts):
            end = starts[i + 1]
        else:
            end = predict_next_period(start, avg_cycle)
        period_days_recorded = [d.isoformat() for d in groups[i]] if i < len(groups) else []
        cycles.append({
            "cycle_number": i + 1,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "length_days": (end - start).days if i + 1 < len(starts) else None,
            "period_days_recorded": period_days_recorded,
            "predicted": False,
        })
    return cycles


def _build_future_cycles(last_start, avg_cycle, num_predictions, period_length):
    cycles = []
    current_start = last_start
    for i in range(num_predictions):
        next_start = predict_next_period(current_start, avg_cycle)
        ovulation = predict_ovulation(next_start)
        fertile_start, fertile_end = predict_fertile_window(ovulation)
        days = generate_phase_days(current_start, next_start, ovulation, fertile_start, fertile_end, period_length)
        cycles.append({
            "cycle_number": f"Prédit {i + 1}",
            "start_date": current_start.isoformat(),
            "end_date": next_start.isoformat(),
            "length_days": (next_start - current_start).days,
            "ovulation_date": ovulation.isoformat(),
            "fertile_window": {"start": fertile_start.isoformat(), "end": fertile_end.isoformat()},
            "days": days,
            "predicted": True,
        })
        current_start = next_start
    return cycles


def _get_current_phase(today, past_cycles, future_cycles, avg_cycle):
    for cycle in past_cycles:
        start = datetime.strptime(cycle["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(cycle["end_date"], "%Y-%m-%d").date()
        if start <= today < end:
            cycle_day = (today - start).days + 1
            period_end = start + timedelta(days=DEFAULT_PERIOD_LENGTH)
            if today <= period_end:
                phase = "period"
            else:
                ovulation = end - timedelta(days=LUTEAL_PHASE_DAYS)
                fertile_start = ovulation - timedelta(days=5)
                fertile_end_dt = ovulation + timedelta(days=1)
                if fertile_start <= today <= fertile_end_dt:
                    phase = "fertile" if today != ovulation else "ovulation"
                else:
                    phase = "normal"
            return {"in_cycle": True, "cycle_day": cycle_day, "cycle_length": (end - start).days, "phase": phase}
    return {"in_cycle": False, "phase": "unknown"}


def _get_next_event(today, past_cycles, future_cycles):
    today_str = today.isoformat()
    for cycle in future_cycles:
        if not cycle.get("days"):
            continue
        for day in cycle["days"]:
            if day["date"] < today_str:
                continue
            phase = day.get("phase", "normal")
            if phase in ("period", "ovulation", "fertile") and day["date"] > today_str:
                event_date = datetime.strptime(day["date"], "%Y-%m-%d").date()
                return {"date": day["date"], "phase": phase, "days_remaining": (event_date - today).days}
    if future_cycles:
        next_start_str = future_cycles[0].get("start_date", "")
        if next_start_str:
            next_start = datetime.strptime(next_start_str, "%Y-%m-%d").date()
            if next_start > today:
                return {"date": next_start_str, "phase": "period", "days_remaining": (next_start - today).days}
    return None


def _compute_reliability(lengths, filtered):
    score = 0
    n = len(filtered)
    if n >= 6: score += 40
    elif n >= 4: score += 30
    elif n >= 2: score += 15
    elif n >= 1: score += 5
    if filtered:
        try:
            sd = stdev(filtered)
            if sd <= 2: score += 40
            elif sd <= 4: score += 30
            elif sd <= 7: score += 15
            else: score += 5
        except ValueError:
            pass
    if lengths:
        rejection_rate = 1 - (len(filtered) / len(lengths))
        if rejection_rate == 0: score += 20
        elif rejection_rate <= 0.2: score += 15
        elif rejection_rate <= 0.5: score += 10
        else: score += 5
    level = "fiable" if score >= 70 else "moyen" if score >= 40 else "faible"
    if score >= 70:
        msg = f"Prédictions fiables basées sur {len(filtered)} cycles analysés."
    elif score >= 40:
        msg = f"Prédictions moyennes — ajoutez encore {max(0, 4 - len(filtered))} cycles pour affiner."
    elif len(filtered) == 0:
        msg = "Marquez vos règles pour commencer les prédictions."
    elif len(filtered) == 1:
        msg = "Un seul cycle enregistré. La prédiction s'améliorera avec plus de données."
    else:
        msg = "Données insuffisantes pour des prédictions fiables."
    return {"score": min(score, 100), "level": level, "cycles_analyzed": len(filtered), "message": msg}


def predict_full(entries: List[Dict], period_length: int = DEFAULT_PERIOD_LENGTH, num_predictions: int = 3) -> Dict:
    period_dates = get_period_dates(entries)
    groups = group_periods(period_dates)
    starts = [g[0] for g in groups]
    lengths = get_cycle_lengths(starts)
    lengths_filtered = filter_cycle_lengths(lengths)
    avg_cycle = compute_average_cycle(lengths_filtered)

    past_cycles = _build_past_cycles(starts, groups, avg_cycle, period_length)
    last_start = starts[-1] if starts else date.today()
    future_cycles = _build_future_cycles(last_start, avg_cycle, num_predictions, period_length)

    today = date.today()
    current_phase = _get_current_phase(today, past_cycles, future_cycles, avg_cycle)
    next_event = _get_next_event(today, past_cycles, future_cycles)
    reliability = _compute_reliability(lengths, lengths_filtered)

    std_dev = stdev(lengths_filtered) if len(lengths_filtered) >= 2 else None
    regularity = "insuffisant" if std_dev is None else "très régulier" if std_dev <= 2 else "régulier" if std_dev <= 4 else "modérément régulier" if std_dev <= 7 else "irrégulier"

    return {
        "past_cycles": past_cycles,
        "future_cycles": future_cycles,
        "current_phase": current_phase,
        "next_event": next_event,
        "stats": {
            "cycle_count": len(lengths_filtered),
            "average_cycle_days": round(avg_cycle, 1),
            "std_dev_days": round(std_dev, 1) if std_dev else None,
            "min_cycle": min(lengths_filtered) if lengths_filtered else None,
            "max_cycle": max(lengths_filtered) if lengths_filtered else None,
            "last_period_start": starts[-1].isoformat() if starts else None,
            "cycle_regularity": regularity,
            "reliability": reliability,
            "period_length_days": period_length,
        },
        "today": today.isoformat(),
    }


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(title="Notre Bulle — API", version="1.1.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

logger = logging.getLogger("notre-bulle-api")

# ============================================================
# SUPABASE CLIENT (via REST API — pas de dépendance supabase-py)
# ============================================================

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "admin@notre-bulle.app")


def get_supabase_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


async def store_subscription(profile_id: str, endpoint: str, p256dh_key: str, auth_key: str) -> bool:
    """Stoque un abonnement push dans Supabase."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.warning("Supabase non configuré — subscription non persistée")
        return False

    url = f"{SUPABASE_URL}/rest/v1/push_subscriptions"
    headers = get_supabase_headers()

    # Upsert : si le même endpoint existe déjà pour ce profile, on le met à jour
    data = {
        "profile_id": profile_id,
        "endpoint": endpoint,
        "p256dh_key": p256dh_key,
        "auth_key": auth_key,
        "updated_at": datetime.utcnow().isoformat(),
    }

    async with httpx.AsyncClient() as client:
        # Vérifier si une subscription existe déjà pour ce profile + endpoint
        check_url = f"{url}?profile_id=eq.{profile_id}&endpoint=eq.{httpx.utils.quote(endpoint, safe='')}"
        check_resp = await client.get(check_url, headers=headers)

        if check_resp.status_code == 200 and check_resp.json():
            # Mise à jour
            patch_resp = await client.patch(
                f"{url}?profile_id=eq.{profile_id}&endpoint=eq.{httpx.utils.quote(endpoint, safe='')}",
                headers=headers,
                json=data,
            )
            return patch_resp.status_code in (200, 204)
        else:
            # Création
            data["id"] = str(uuid.uuid4())
            data["created_at"] = datetime.utcnow().isoformat()
            post_resp = await client.post(url, headers=headers, json=data)
            return post_resp.status_code in (200, 201, 204)


async def get_subscriptions(profile_id: str) -> List[Dict]:
    """Récupère tous les abonnements push d'un profil."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return []

    url = f"{SUPABASE_URL}/rest/v1/push_subscriptions?profile_id=eq.{profile_id}&select=endpoint,p256dh_key,auth_key"
    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return resp.json()
        return []


async def delete_subscription(profile_id: str, endpoint: str) -> bool:
    """Supprime un abonnement push."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False

    url = f"{SUPABASE_URL}/rest/v1/push_subscriptions?profile_id=eq.{profile_id}&endpoint=eq.{httpx.utils.quote(endpoint, safe='')}"
    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=headers)
        return resp.status_code in (200, 204)


# ============================================================
# MODÈLES PUSH
# ============================================================

class PushSubscribeIn(BaseModel):
    profile_id: str
    endpoint: str
    p256dh_key: str
    auth_key: str


class PushNotifyIn(BaseModel):
    recipient_profile_id: str
    title: str
    body: str
    data: Optional[Dict[str, Any]] = None


# ============================================================
# MODÈLES CYCLE (existants)
# ============================================================

class CycleEntryIn(BaseModel):
    profile_id: str
    event_date: str
    event_type: str = "period"
    notes: Optional[str] = None


class PredictionRequest(BaseModel):
    entries: List[CycleEntryIn]
    period_length: int = 5
    num_predictions: int = 3


_db: List[Dict[str, Any]] = []


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/")
@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "Notre Bulle — API",
        "version": "1.1.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/predict")
def predict_cycle(request: PredictionRequest):
    entries = [e.model_dump() for e in request.entries]
    return predict_full(entries=entries, period_length=request.period_length, num_predictions=request.num_predictions)


@app.post("/api/demo/seed")
def seed_demo():
    demo_profile = "demo-couple"
    base = date.today() - timedelta(days=120)
    periods = [base, base + timedelta(days=27), base + timedelta(days=56), base + timedelta(days=83)]
    count = 0
    for p in periods:
        for i in range(5):
            _db.append({
                "id": str(uuid.uuid4()), "profile_id": demo_profile,
                "event_date": (p + timedelta(days=i)).isoformat(),
                "event_type": "period", "notes": None,
                "created_at": datetime.utcnow().isoformat(),
            })
            count += 1
    return {"status": "seeded", "count": count, "profile_id": demo_profile}


# ============================================================
# PUSH NOTIFICATION ENDPOINTS
# ============================================================

@app.post("/api/push/subscribe")
async def push_subscribe(request: PushSubscribeIn):
    """
    Enregistre un abonnement push pour un profil.
    Appelé par le navigateur après avoir souscrit via PushManager.subscribe().
    """
    if not request.profile_id or not request.endpoint:
        raise HTTPException(status_code=400, detail="profile_id et endpoint requis")

    ok = await store_subscription(
        profile_id=request.profile_id,
        endpoint=request.endpoint,
        p256dh_key=request.p256dh_key,
        auth_key=request.auth_key,
    )

    if ok:
        return {"status": "ok", "message": "Subscription enregistrée"}
    else:
        # Même si Supabase n'est pas dispo, l'abonnement est actif côté navigateur
        # Il sera réutilisé au prochain envoi
        logger.warning("Subscription non persistée (Supabase non configuré ou erreur)")
        return {"status": "ok", "message": "Subscription locale (non persistée)"}


@app.post("/api/push/notify")
async def push_notify(request: PushNotifyIn):
    """
    Envoie une notification push au partenaire.
    Récupère tous les abonnements push du destinataire et envoie
    la notification à chacun via Web Push Protocol.
    """
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.error("VAPID keys non configurées — push impossible")
        raise HTTPException(status_code=500, detail="VAPID keys non configurées sur le serveur")

    # Récupérer les abonnements du destinataire
    subscriptions = await get_subscriptions(request.recipient_profile_id)

    if not subscriptions:
        logger.info(f"Aucune subscription push pour {request.recipient_profile_id}")
        return {"status": "ok", "sent": 0, "total": 0}

    # Payload à envoyer
    payload = {
        "title": request.title,
        "body": request.body,
        "data": request.data or {},
        "tag": "notre-bulle",
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    sent_count = 0
    errors = []

    for sub in subscriptions:
        try:
            await _send_single_push(
                endpoint=sub["endpoint"],
                p256dh_key=sub["p256dh_key"],
                auth_key=sub["auth_key"],
                payload_bytes=payload_bytes,
            )
            sent_count += 1
        except Exception as e:
            errors.append(str(e))
            logger.error(f"Erreur envoi push à {sub['endpoint'][:50]}...: {e}")

    return {
        "status": "ok",
        "sent": sent_count,
        "total": len(subscriptions),
        "errors": errors if errors else None,
    }


async def _send_single_push(
    endpoint: str,
    p256dh_key: str,
    auth_key: str,
    payload_bytes: bytes,
):
    """
    Envoie une notification push via Web Push Protocol avec pywebpush.
    """
    from pywebpush import webpush

    webpush(
        subscription_info={
            "endpoint": endpoint,
            "keys": {
                "p256dh": p256dh_key,
                "auth": auth_key,
            },
        },
        data=payload_bytes,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={
            "sub": f"mailto:{VAPID_CLAIM_EMAIL}",
        },
        content_encoding="aes128gcm",
    )
