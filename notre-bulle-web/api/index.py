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

from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from urllib.parse import quote
import httpx

# Proxy Supabase — masque la clé anon du frontend
try:
    from supa_proxy import router as supa_router
except ImportError:
    from .supa_proxy import router as supa_router

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
    """Trouve le prochain événement important (règles, ovulation, fertile).

    La période en cours n'est pas un « prochain » événement : on ignore les
    jours de règles qui suivent directement le début de cycle en cours, afin
    d'afficher le prochain événement réellement à venir (ex. l'ovulation quand
    on est en règles, ou les prochaines règles sinon).
    """
    today_str = today.isoformat()
    prev_was_period = False
    for cycle in future_cycles:
        if not cycle.get("days"):
            continue
        for day in cycle["days"]:
            phase = day.get("phase", "normal")
            if day["date"] <= today_str:
                # On mémorise la phase du dernier jour ≤ aujourd'hui pour
                # savoir si une période est déjà en cours.
                prev_was_period = (phase == "period")
                continue
            if phase == "period" and prev_was_period:
                # Suite de la période déjà en cours → pas un nouvel événement
                prev_was_period = True
                continue
            if phase in ("period", "ovulation", "fertile"):
                event_date = datetime.strptime(day["date"], "%Y-%m-%d").date()
                return {"date": day["date"], "phase": phase, "days_remaining": (event_date - today).days}
            prev_was_period = False
    # Repli : prochain début de cycle prédit (si aucun jour trouvé plus haut)
    if future_cycles:
        for cycle in future_cycles:
            next_start_str = cycle.get("start_date", "")
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


def _parse_today(today_str: Optional[str]) -> date:
    """Analyse la date « aujourd'hui » envoyée par le client (fuseau local).

    Le serveur tourne en UTC (Vercel) alors que le client vit dans son fuseau
    local. Pour que la carte « Aujourd'hui » soit cohérente avec les jours que
    marque l'utilisatrice, on accepte la date locale du client et on retombe
    sur date.today() si elle est absente ou invalide.
    """
    if today_str:
        try:
            return datetime.strptime(today_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass
    return date.today()


def predict_full(entries: List[Dict], period_length: int = DEFAULT_PERIOD_LENGTH, num_predictions: int = 3, today: Optional[str] = None) -> Dict:
    period_dates = get_period_dates(entries)
    groups = group_periods(period_dates)
    starts = [g[0] for g in groups]
    lengths = get_cycle_lengths(starts)
    lengths_filtered = filter_cycle_lengths(lengths)
    avg_cycle = compute_average_cycle(lengths_filtered)

    past_cycles = _build_past_cycles(starts, groups, avg_cycle, period_length)
    last_start = starts[-1] if starts else date.today()
    future_cycles = _build_future_cycles(last_start, avg_cycle, num_predictions, period_length)

    today = _parse_today(today)
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

# CORS restreint aux domaines autorisés (pas de wildcard * !)
ALLOWED_ORIGINS = [
    "https://notre-bulle-web.vercel.app",
    "http://localhost:5173",   # dev Vite
    "http://localhost:3000",   # dev fallback
]app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)

# Inclure le router proxy Supabase (masque la clé anon du frontend)
app.include_router(supa_router)


logger = logging.getLogger("notre-bulle-api")

# ============================================================
# SUPABASE CLIENT (via REST API — pas de dépendance supabase-py)
# ============================================================

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "admin@notre-bulle.app")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")

# ============================================================
# JWT VERIFICATION — vérifie les tokens Supabase Auth
# ============================================================
import base64
import hashlib
import hmac
from functools import lru_cache

try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None

# JWKS cache (Supabase expose ses clés publiques via /.well-known/jwks.json)
_jwks_cache: Optional[Dict] = None
_jwks_cache_time: float = 0


@lru_cache(maxsize=1)
def _get_supabase_jwt_secret() -> Optional[str]:
    """Récupère le JWT secret Supabase pour vérification locale.
    
    En production, on utilise les JWKS. En fallback, on peut utiliser
    le JWT secret depuis les variables d'env.
    """
    return os.environ.get("SUPABASE_JWT_SECRET", "")


async def _fetch_jwks() -> Optional[Dict]:
    """Récupère les clés publiques JWKS de Supabase (cache 1h)."""
    global _jwks_cache, _jwks_cache_time
    import time
    
    if _jwks_cache and (time.time() - _jwks_cache_time) < 3600:
        return _jwks_cache
    
    if not SUPABASE_URL:
        return None
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SUPABASE_URL}/.well-known/jwks.json", timeout=5.0)
            if resp.status_code == 200:
                _jwks_cache = resp.json()
                _jwks_cache_time = time.time()
                return _jwks_cache
    except Exception:
        pass
    return None


def _decode_jwt_payload(token: str) -> Optional[Dict]:
    """Décode le payload d'un JWT sans vérifier la signature ( fallback )."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        # Ajouter le padding base64
        payload += "=" * (4 - len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return None


async def verify_supabase_token(authorization: Optional[str]) -> Optional[Dict]:
    """Vérifie un token Supabase Auth.
    
    Retourne le payload décodé si le token est valide, None sinon.
    Priorité : PyJWT + JWKS > PyJWT + secret > décodage sans vérif.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    token = authorization[7:]  # Enlever "Bearer "
    
    # 1. Essayer PyJWT + JWKS (vérification complète)
    if pyjwt:
        try:
            jwks = await _fetch_jwks()
            if jwks and "keys" in jwks:
                from jwt import PyJWKClient
                jwk_client = PyJWKClient(f"{SUPABASE_URL}/.well-known/jwks.json")
                signing_key = jwk_client.get_signing_key_from_jwt(token)
                payload = pyjwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["HS256"],
                    audience="authenticated",
                    options={"verify_exp": True},
                )
                return payload
        except Exception:
            pass
    
    # 2. Essayer PyJWT + JWT secret (si configuré)
    jwt_secret = _get_supabase_jwt_secret()
    if pyjwt and jwt_secret:
        try:
            payload = pyjwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_exp": True},
            )
            return payload
        except Exception:
            pass
    
    # 3. Fallback : décodage sans vérif de signature
    #    (protège contre les tokens expirés mais pas contre les forgeries)
    payload = _decode_jwt_payload(token)
    if payload:
        import time
        exp = payload.get("exp", 0)
        if exp and exp < time.time():
            return None  # Token expiré
        if payload.get("role") not in ("authenticated", "anon"):
            return None
        return payload
    
    return None
# Les deux profils du couple. L'app est utilisée par les 2 partenaires sur le
# même téléphone ; ces IDs sont la source de vérité (identité + push), même si
# conversation_members contient d'anciens IDs divergents.
MY_PROFILE_ID = os.environ.get("VITE_MY_PROFILE_ID", "")
PARTNER_PROFILE_ID = os.environ.get("VITE_PARTNER_PROFILE_ID", "")


def resolve_couple_recipient(sender_id: str) -> Optional[str]:
    """Renvoie le profil du partenaire : l'autre membre du couple.

    Le destinataire d'un appel ou d'un message émis par l'un des deux profils
    configurés est toujours l'autre profil. Indépendant de conversation_members,
    qui contient des IDs historiques divergents (donc la résolution par
    conversation renvoyait un profil sans abonnement push → total:0).
    """
    if not sender_id:
        return None
    if MY_PROFILE_ID and sender_id == MY_PROFILE_ID:
        return PARTNER_PROFILE_ID or None
    if PARTNER_PROFILE_ID and sender_id == PARTNER_PROFILE_ID:
        return MY_PROFILE_ID or None
    return None


def derive_push_tag(data: Optional[Dict[str, Any]]) -> str:
    """Tag de notification DISTINCT (évite le collision d'anciens tags).

    Avant, TOUTES les notifications partageaient le tag 'notre-bulle' :
    quand une notification de message arrivait pendant un appel entrant
    (ou inversement), la 2e remplaçait la 1re SANS sonner ni vibrer.

    Règles de dérivation :
      - écran 'call'            → call-<callId> (ou call-incoming si absent)
      - data.conversationId     → msg-<conversationId>
      - sinon                   → notre-bulle (repli générique)
    """
    if not data:
        return "notre-bulle"
    if data.get("screen") == "call":
        call_id = data.get("callId")
        return f"call-{call_id}" if call_id else "call-incoming"
    conv_id = data.get("conversationId")
    if conv_id:
        return f"msg-{conv_id}"
    return "notre-bulle"


def get_supabase_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


async def store_subscription(profile_id: str, endpoint: str, p256dh_key: str, auth_key: str) -> Tuple[bool, str]:
    """Stoque un abonnement push dans Supabase.

    Retourne (ok, detail) : detail explique la raison en cas d'échec
    (utile pour diagnostiquer les problèmes de persistence RLS).
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.warning("Supabase non configuré — subscription non persistée")
        return False, "Supabase non configuré"

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
        check_url = f"{url}?profile_id=eq.{profile_id}&endpoint=eq.{quote(endpoint, safe='')}"
        check_resp = await client.get(check_url, headers=headers)

        if check_resp.status_code == 200 and check_resp.json():
            # Mise à jour
            patch_resp = await client.patch(
                f"{url}?profile_id=eq.{profile_id}&endpoint=eq.{quote(endpoint, safe='')}",
                headers=headers,
                json=data,
            )
            ok = patch_resp.status_code in (200, 204)
            return ok, ("subscription à jour" if ok else f"échec UPDATE → HTTP {patch_resp.status_code}")
        else:
            # Création
            data["id"] = str(uuid.uuid4())
            data["created_at"] = datetime.utcnow().isoformat()
            post_resp = await client.post(url, headers=headers, json=data)
            ok = post_resp.status_code in (200, 201, 204)
            detail = "subscription créée" if ok else f"échec INSERT → HTTP {post_resp.status_code}"
            if not ok:
                try:
                    detail += f" — {post_resp.text[:200]}"
                except Exception:
                    pass
                logger.error(f"push_subscriptions INSERT refusé: {detail}")
            return ok, detail


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

    url = f"{SUPABASE_URL}/rest/v1/push_subscriptions?profile_id=eq.{profile_id}&endpoint=eq.{quote(endpoint, safe='')}"
    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=headers)
        return resp.status_code in (200, 204)


async def get_conversation_recipient(conv_id: str, sender_id: str) -> Optional[str]:
    """Trouve le profil du destinataire dans une conversation (l'autre membre)."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    url = f"{SUPABASE_URL}/rest/v1/conversation_members?conversation_id=eq.{quote(conv_id)}&select=profile_id"
    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            logger.warning(f"Erreur récupération membres conv {conv_id}: {resp.status_code}")
            return None

        members = resp.json()
        for member in members:
            if member.get("profile_id") != sender_id:
                return member["profile_id"]

    logger.warning(f"Aucun destinataire trouvé dans conv {conv_id} (sender={sender_id})")
    return None


async def get_default_conversation_recipient(caller_id: str) -> Optional[str]:
    """Trouve le destinataire d'un appel : l'autre membre de la conversation.

    Le schéma est un couple avec une seule conversation (le client prend
    la première via `limit(1)`). On récupère cette conversation puis on
    renvoie le membre qui n'est pas l'appelant.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        # 1. La conversation du couple (il n'y en a qu'une)
        conv_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/conversations?select=id&limit=1",
            headers=headers,
        )
        if conv_resp.status_code != 200 or not conv_resp.json():
            logger.warning(f"Erreur récupération conversation pour l'appel: HTTP {conv_resp.status_code}")
            return None
        conv_id = conv_resp.json()[0]["id"]

        # 2. Les membres → renvoyer l'autre (≠ caller_id)
        members_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/conversation_members?conversation_id=eq.{quote(conv_id)}&select=profile_id",
            headers=headers,
        )
        if members_resp.status_code != 200:
            logger.warning(f"Erreur récupération membres conv {conv_id}: {members_resp.status_code}")
            return None

        members = members_resp.json()
        for member in members:
            if member.get("profile_id") != caller_id:
                return member["profile_id"]

    logger.warning(f"Aucun destinataire pour l'appel (caller={caller_id})")
    return None


async def get_sender_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    """Récupère les infos d'un profil (display_name)."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{quote(profile_id)}&select=id,display_name"
    headers = get_supabase_headers()

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if data:
                return data[0]
        return None


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


class WebhookPayload(BaseModel):
    """Payload reçu d'un Database Webhook Supabase."""
    type: str
    table: str
    record: Dict[str, Any]
    schema: str
    old_record: Optional[Dict[str, Any]] = None


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
    # Date locale du client (AAAA-MM-JJ). Optionnelle : si absente, le serveur
    # utilise date.today() (UTC). La passer évite les décalages de fuseau.
    today: Optional[str] = None


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
async def predict_cycle(request: PredictionRequest, authorization: Optional[str] = Header(None)):
    """Prédiction de cycle — PROTÉGÉ par authentification Supabase.
    
    Seuls les utilisateurs authentifiés (sign-in anonyme) peuvent accéder
    aux données de cycle. Empêche l'exposition de données de santé sensibles.
    """
    # Vérifier l'authentification
    payload = await verify_supabase_token(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    entries = [e.model_dump() for e in request.entries]
    return predict_full(
        entries=entries,
        period_length=request.period_length,
        num_predictions=request.num_predictions,
        today=request.today,
    )


@app.post("/api/demo/seed")
async def seed_demo(authorization: Optional[str] = Header(None)):
    """Seed de données démo — PROTÉGÉ par authentification."""
    payload = await verify_supabase_token(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Authentification requise")
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
async def push_subscribe(request: PushSubscribeIn, authorization: Optional[str] = Header(None)):
    """
    Enregistre un abonnement push pour un profil.
    Appelé par le navigateur après avoir souscrit via PushManager.subscribe().
    PROTÉGÉ : authentification Supabase requise.
    """
    payload = await verify_supabase_token(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    if not request.profile_id or not request.endpoint:
        raise HTTPException(status_code=400, detail="profile_id et endpoint requis")

    ok, detail = await store_subscription(
        profile_id=request.profile_id,
        endpoint=request.endpoint,
        p256dh_key=request.p256dh_key,
        auth_key=request.auth_key,
    )

    if not ok:
        # IMPORTANT : renvoyer une vraie erreur (500) si l'abonnement n'est pas
        # persisté en base. Avant, on renvoyait 200 même en cas d'échec → la
        # table push_subscriptions restait vide → aucun push envoyé quand l'app
        # est fermée (seul Realtime fonctionnait quand elle était ouverte).
        logger.error(f"Subscription push non persistée: {detail}")
        raise HTTPException(status_code=500, detail=f"Erreur enregistrement subscription: {detail}")

    return {"status": "ok", "message": "Subscription enregistrée"}


@app.post("/api/push/notify")
async def push_notify(request: PushNotifyIn, authorization: Optional[str] = Header(None)):
    """
    Envoie une notification push au partenaire.
    Récupère tous les abonnements push du destinataire et envoie
    la notification à chacun via Web Push Protocol.
    PROTÉGÉ : authentification Supabase requise.
    """
    payload = await verify_supabase_token(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Authentification requise")
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.error("VAPID keys non configurées — push impossible")
        raise HTTPException(status_code=500, detail="VAPID keys non configurées sur le serveur")

    # Récupérer les abonnements du destinataire
    subscriptions = await get_subscriptions(request.recipient_profile_id)

    if not subscriptions:
        logger.info(f"Aucune subscription push pour {request.recipient_profile_id}")
        return {"status": "ok", "sent": 0, "total": 0}

    # Payload à envoyer — tag distinct dérivé des data (call-<callId>,
    # msg-<conversationId>…) pour ne jamais écraser une notification d'appel
    # par une notification de message (ni l'inverse).
    data = request.data or {}
    payload = {
        "title": request.title,
        "body": request.body,
        "data": data,
        "tag": derive_push_tag(data),
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


@app.post("/api/push/on-new-message")
async def push_on_new_message(
    payload: WebhookPayload,
    x_supabase_secret: Optional[str] = Header(None, alias="X-Supabase-Secret"),
):
    """
    Endpoint appelé par le Supabase Database Webhook à chaque INSERT
    dans la table 'messages'. Envoie une notification push au destinataire
    du message de façon fiable (côté serveur).
    """
    # Vérifier le secret partagé (si configuré)
    if WEBHOOK_SECRET and x_supabase_secret != WEBHOOK_SECRET:
        logger.warning("Tentative d'accès webhook avec secret invalide")
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    if payload.type != "INSERT" or payload.table != "messages":
        return {"status": "ignored", "reason": "type or table mismatch"}

    record = payload.record
    if not record or not record.get("id"):
        return {"status": "ignored", "reason": "empty record"}

    # Ne pas envoyer de push pour les messages de type 'call' (gérés localement)
    msg_type = record.get("type", "")
    if msg_type == "call":
        return {"status": "ignored", "reason": "call type messages handled locally"}

    conv_id = record.get("conversation_id")
    sender_id = record.get("sender_id")
    if not conv_id or not sender_id:
        return {"status": "ignored", "reason": "missing conversation_id or sender_id"}

    # Trouver le destinataire — les IDs configurés d'abord (même raison que
    # pour les appels : conversation_members est divergent)
    recipient_id = resolve_couple_recipient(sender_id) or await get_conversation_recipient(conv_id, sender_id)
    if not recipient_id:
        logger.info(f"Aucun destinataire pour le message {record.get('id')}")
        return {"status": "ok", "sent": 0, "total": 0}

    # Récupérer le nom de l'expéditeur
    sender_profile = await get_sender_profile(sender_id)
    sender_name = sender_profile.get("display_name", "Partenaire") if sender_profile else "Partenaire"

    # Construire le corps de la notification
    content = record.get("content")
    body = (
        content if msg_type == "text" and content
        else "Photo" if msg_type == "image"
        else "Message vocal" if msg_type == "voice"
        else "Vidéo" if msg_type == "video"
        else "Nouveau message"
    )

    # Récupérer les souscriptions push du destinataire
    subscriptions = await get_subscriptions(recipient_id)
    if not subscriptions:
        logger.info(f"Aucune subscription push pour {recipient_id}")
        return {"status": "ok", "sent": 0, "total": 0}

    # Payload push — tag distinct msg-<conversationId> : deux messages dans la
    # même conversation partagent le même tag (remplacement propre) mais une
    # notification d'appel entrant (call-<callId>) ne sera jamais écrasée.
    push_payload = {
        "title": sender_name,
        "body": body,
        "data": {
            "screen": "chat",
            "conversationId": conv_id,
        },
        "tag": f"msg-{conv_id}",
    }
    payload_bytes = json.dumps(push_payload).encode("utf-8")

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.error("VAPID keys non configurées — push impossible")
        # Retourner 200 pour ne pas faire retry le webhook
        return {"status": "ok", "sent": 0, "total": 0, "warning": "VAPID not configured"}

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
            logger.error(f"Erreur envoi push webhook à {sub['endpoint'][:50]}...: {e}")

    return {
        "status": "ok",
        "sent": sent_count,
        "total": len(subscriptions),
        "errors": errors if errors else None,
    }


@app.post("/api/push/on-new-call")
async def push_on_new_call(
    payload: WebhookPayload,
    x_supabase_secret: Optional[str] = Header(None, alias="X-Supabase-Secret"),
):
    """
    Endpoint appelé par le trigger DB à chaque INSERT dans la table 'calls'.
    Envoie une notification push d'appel entrant au partenaire, avec
    `screen: 'call'` pour que le service worker navigue vers /call.
    """
    # Vérifier le secret partagé (si configuré)
    if WEBHOOK_SECRET and x_supabase_secret != WEBHOOK_SECRET:
        logger.warning("Tentative d'accès webhook call avec secret invalide")
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    if payload.type != "INSERT" or payload.table != "calls":
        return {"status": "ignored", "reason": "type or table mismatch"}

    record = payload.record
    if not record or not record.get("id"):
        return {"status": "ignored", "reason": "empty record"}

    # Le client insère un appel avec status 'missed' (= en attente de réponse
    # dans ce schéma). Uniquement ce statut correspond à un appel entrant.
    if record.get("status") != "missed":
        return {"status": "ignored", "reason": "call not pending"}

    caller_id = record.get("caller_id")
    call_type = record.get("type", "audio")
    if not caller_id:
        return {"status": "ignored", "reason": "missing caller_id"}

    # Trouver le destinataire (l'autre membre du couple). On passe d'abord par
    # les IDs configurés (source de vérité) — conversation_members contient des
    # IDs historiques divergents, sans abonnement push.
    recipient_id = resolve_couple_recipient(caller_id) or await get_default_conversation_recipient(caller_id)
    if not recipient_id:
        logger.info(f"Aucun destinataire pour l'appel {record.get('id')}")
        return {"status": "ok", "sent": 0, "total": 0}

    # Nom de l'appelant
    caller_profile = await get_sender_profile(caller_id)
    caller_name = caller_profile.get("display_name", "Partenaire") if caller_profile else "Partenaire"

    # Souscriptions push du destinataire
    subscriptions = await get_subscriptions(recipient_id)
    if not subscriptions:
        logger.info(f"Aucune subscription push pour {recipient_id}")
        return {"status": "ok", "sent": 0, "total": 0}

    type_label = "Video" if call_type == "video" else "Audio"
    call_id = record.get("id")
    push_payload = {
        "title": f"Appel {type_label}",
        "body": f"{caller_name} t'appelle...",
        "data": {
            "screen": "call",
            "callType": call_type,
            "callId": call_id,
        },
        # Tag unique par appel : call-<callId>. Une nouvelle notification
        # remplace proprement celle d'un appel précédent, sans jamais être
        # écrasée par un message (msg-<conversationId>).
        "tag": f"call-{call_id}",
    }
    payload_bytes = json.dumps(push_payload).encode("utf-8")

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.error("VAPID keys non configurées — push impossible")
        return {"status": "ok", "sent": 0, "total": 0, "warning": "VAPID not configured"}

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
            logger.error(f"Erreur envoi push call à {sub['endpoint'][:50]}...: {e}")

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
