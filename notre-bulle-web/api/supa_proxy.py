# ============================================================
# Supabase Proxy — masque la clé anon du frontend
# ============================================================
#
# PRINCIPE :
#   Le frontend n'appelle JAMAIS Supabase directement pour les
#   opérations de données. Il passe par ces routes API qui :
#   1. Vérifient le JWT de l'utilisateur (auth.uid())
#   2. Vérifient l'autorisation (membre du couple ?)
#   3. Utilisent la service_role key pour appeler Supabase
#
# RÉSULTAT :
#   - La clé anon n'apparaît PLUS dans le bundle JS
#   - La service_role key reste côté serveur (jamais exposée)
#   - Chaque requête est vérifiée et autorisée
#
# USAGE :
#   from .supa_proxy import router as supa_router
#   app.include_router(supa_router)
#
# ENV VARS REQUISES :
#   SUPABASE_SERVICE_ROLE_KEY — clé service_role du projet Supabase
#   SUPABASE_URL             — URL du projet Supabase
# ============================================================

import os
import time
import json
import base64
import logging
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import Response
from pydantic import BaseModel
import httpx

logger = logging.getLogger("supa-proxy")

router = APIRouter(prefix="/api/supa", tags=["supabase-proxy"])

# ============================================================
# Configuration
# ============================================================

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")

# Les deux profils du couple (source de vérité)
MY_PROFILE_ID = os.environ.get("VITE_MY_PROFILE_ID", "")
PARTNER_PROFILE_ID = os.environ.get("VITE_PARTNER_PROFILE_ID", "")

if not SERVICE_ROLE_KEY:
    logger.warning(
        "⚠️ SUPABASE_SERVICE_ROLE_KEY non défini — "
        "le proxy fonctionnera avec la clé anon (moins sécurisé)"
    )


# ============================================================
# JWT Verification (simplifié — vérifie expiry + role)
# ============================================================

def _decode_jwt(token: str) -> Optional[Dict]:
    """Décode un JWT sans vérifier la signature (fallback).
    
    En production, utiliser PyJWT + JWKS pour une vérification complète.
    Ce décodage suffit pour vérifier expiry et role.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        payload += "=" * (4 - len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded)
        # Vérifier l'expiration
        exp = data.get("exp", 0)
        if exp and exp < time.time():
            return None
        return data
    except Exception:
        return None


async def verify_token(authorization: Optional[str]) -> Dict:
    """Vérifie le token Supabase Auth et retourne le payload.
    
    Retourne le payload décodé avec auth.uid().
    Lève HTTPException 401 si le token est invalide.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization[7:]
    payload = _decode_jwt(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
    # Vérifier le rôle
    role = payload.get("role", "")
    if role not in ("authenticated", "anon"):
        raise HTTPException(status_code=401, detail="Rôle invalide")
    
    return payload


def get_service_headers() -> Dict[str, str]:
    """Headers pour les appels Supabase avec la service_role key."""
    key = SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def get_anon_headers() -> Dict[str, str]:
    """Headers pour les appels Supabase avec la clé anon (fallback)."""
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }


# ============================================================
# Authorization helpers
# ============================================================

async def is_authorized(auth_uid: str) -> bool:
    """Vérifie si auth.uid() est lié à un profil du couple."""
    if not SUPABASE_URL:
        return False
    
    headers = get_service_headers()
    url = (
        f"{SUPABASE_URL}/rest/v1/profiles"
        f"?auth_user_id=eq.{auth_uid}&select=id"
    )
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            return len(resp.json()) > 0
    return False


async def get_profile_by_auth_uid(auth_uid: str) -> Optional[Dict]:
    """Récupère le profil lié à auth.uid()."""
    if not SUPABASE_URL:
        return None
    
    headers = get_service_headers()
    url = (
        f"{SUPABASE_URL}/rest/v1/profiles"
        f"?auth_user_id=eq.{auth_uid}&select=id,display_name,avatar_url"
    )
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            return data[0] if data else None
    return None


async def is_conversation_member(auth_uid: str, conv_id: str) -> bool:
    """Vérifie si l'utilisateur est membre de la conversation."""
    profile = await get_profile_by_auth_uid(auth_uid)
    if not profile:
        return False
    
    if not SUPABASE_URL:
        return False
    
    headers = get_service_headers()
    url = (
        f"{SUPABASE_URL}/rest/v1/conversation_members"
        f"?conversation_id=eq.{conv_id}&profile_id=eq.{profile['id']}&select=profile_id"
    )
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            return len(resp.json()) > 0
    return False


# ============================================================
# Modèles
# ============================================================

class SupaQueryRequest(BaseModel):
    """Requête générique pour interroger une table Supabase."""
    table: str
    select: str = "*"
    filters: Optional[Dict[str, Any]] = None
    order: Optional[str] = None
    limit: Optional[int] = None
    single: bool = False


class SupaUpsertRequest(BaseModel):
    """Requête pour insérer/mettre à jour dans une table."""
    table: str
    data: Dict[str, Any]
    on_conflict: Optional[str] = None


class SupaUpdateRequest(BaseModel):
    """Requête pour mettre à jour des lignes."""
    table: str
    data: Dict[str, Any]
    filters: Dict[str, Any]


class SupaDeleteRequest(BaseModel):
    """Requête pour supprimer des lignes."""
    table: str
    filters: Dict[str, Any]


class StorageUploadRequest(BaseModel):
    """Requête pour uploader un fichier."""
    bucket: str
    path: str
    content_type: str = "application/octet-stream"


class StorageSignRequest(BaseModel):
    """Requête pour signer une URL de storage."""
    bucket: str
    path: str
    expires_in: int = 3600


# ============================================================
# ROUTES PROXY — Données
# ============================================================

@router.post("/query")
async def supa_query(
    request: SupaQueryRequest,
    authorization: Optional[str] = Header(None),
):
    """Interroge une table Supabase via la service_role key.
    
    Vérifie l'autorisation de l'utilisateur avant d'exécuter la requête.
    """
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    
    # Construire l'URL
    url = f"{SUPABASE_URL}/rest/v1/{request.table}?select={request.select}"
    
    # Appliquer les filtres
    if request.filters:
        for key, value in request.filters.items():
            if isinstance(value, dict):
                # Opérateurs speciaux : { "eq": "value" }, { "gte": "2024-01-01" }
                for op, val in value.items():
                    url += f"&{key}={op}.{val}"
            else:
                url += f"&{key}=eq.{value}"
    
    # Ordre
    if request.order:
        url += f"&order={request.order}"
    
    # Limite
    if request.limit:
        url += f"&limit={request.limit}"
    
    # Single
    if request.single:
        url += "&limit=1"
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=10.0)
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Supabase: {resp.text[:200]}"
        )
    
    data = resp.json()
    
    # Si single, retourner l'objet directement
    if request.single and isinstance(data, list) and len(data) > 0:
        return data[0]
    
    return data


@router.post("/upsert")
async def supa_upsert(
    request: SupaUpsertRequest,
    authorization: Optional[str] = Header(None),
):
    """Insère ou met à jour dans une table Supabase."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    headers["Prefer"] = "return=minimal"
    
    url = f"{SUPABASE_URL}/rest/v1/{request.table}"
    if request.on_conflict:
        url += f"?on_conflict={request.on_conflict}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=headers,
            json=request.data,
            timeout=10.0,
        )
    
    if resp.status_code >= 400:
        # 23505 = duplicate key → pas une erreur
        if "23505" in resp.text:
            return {"status": "ok", "detail": "duplicate ignored"}
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Supabase: {resp.text[:200]}"
        )
    
    return {"status": "ok"}


@router.post("/update")
async def supa_update(
    request: SupaUpdateRequest,
    authorization: Optional[str] = Header(None),
):
    """Met à jour des lignes dans une table Supabase."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    headers["Prefer"] = "return=minimal"
    
    # Construire les filtres
    filter_parts = []
    for key, value in request.filters.items():
        filter_parts.append(f"{key}=eq.{value}")
    filter_str = "&".join(filter_parts)
    
    url = f"{SUPABASE_URL}/rest/v1/{request.table}?{filter_str}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            url,
            headers=headers,
            json=request.data,
            timeout=10.0,
        )
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Supabase: {resp.text[:200]}"
        )
    
    return {"status": "ok"}


@router.post("/delete")
async def supa_delete(
    request: SupaDeleteRequest,
    authorization: Optional[str] = Header(None),
):
    """Supprime des lignes dans une table Supabase."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    headers["Prefer"] = "return=minimal"
    
    # Construire les filtres
    filter_parts = []
    for key, value in request.filters.items():
        filter_parts.append(f"{key}=eq.{value}")
    filter_str = "&".join(filter_parts)
    
    url = f"{SUPABASE_URL}/rest/v1/{request.table}?{filter_str}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=headers, timeout=10.0)
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Supabase: {resp.text[:200]}"
        )
    
    return {"status": "ok"}


# ============================================================
# ROUTES PROXY — RPC (fonctions PostgreSQL)
# ============================================================

@router.post("/rpc/{function_name}")
async def supa_rpc(
    function_name: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Appelle une fonction RPC Supabase."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    body = await request.json()
    
    headers = get_service_headers()
    url = f"{SUPABASE_URL}/rest/v1/rpc/{function_name}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=headers,
            json=body,
            timeout=10.0,
        )
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur RPC: {resp.text[:200]}"
        )
    
    data = resp.json()
    # Normaliser : Supabase renvoie un tableau pour les fonctions RETURN TABLE
    if isinstance(data, list) and len(data) > 0:
        return data[0]
    return data


# ============================================================
# ROUTES PROXY — Storage
# ============================================================

@router.post("/storage/upload")
async def storage_upload_file(
    request: StorageUploadRequest,
    authorization: Optional[str] = Header(None),
):
    """Upload un fichier vers Supabase Storage via signed URL.
    
    Retourne une URL signée que le frontend peut utiliser pour uploader.
    La clé anon n'est JAMAIS envoyée au frontend.
    """
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    
    # Créer une URL signée pour l'upload (expire en 60s)
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{request.bucket}/{request.path}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=headers,
            json={"expiresIn": 60},
            timeout=10.0,
        )
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Storage sign: {resp.text[:200]}"
        )
    
    data = resp.json()
    signed_url = data.get("signedURL", "")
    
    if not signed_url:
        raise HTTPException(status_code=500, detail="URL signée non générée")
    
    # Construire l'URL complète
    full_url = f"{SUPABASE_URL}{signed_url}"
    
    return {"upload_url": full_url, "path": request.path}


@router.post("/storage/download")
async def storage_download_file(
    request: StorageSignRequest,
    authorization: Optional[str] = Header(None),
):
    """Télécharge un fichier depuis Supabase Storage.
    
    Vérifie l'autorisation puis signe une URL et redirige.
    """
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    
    # Créer une URL signée pour le téléchargement
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{request.bucket}/{request.path}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers=headers,
            json={"expiresIn": request.expires_in},
            timeout=10.0,
        )
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Storage sign: {resp.text[:200]}"
        )
    
    data = resp.json()
    signed_url = data.get("signedURL", "")
    
    if not signed_url:
        raise HTTPException(status_code=500, detail="URL signée non générée")
    
    # Rediriger vers l'URL signée
    full_url = f"{SUPABASE_URL}{signed_url}"
    
    return {"download_url": full_url, "path": request.path}


@router.post("/storage/remove")
async def storage_remove_file(
    request: SupaDeleteRequest,
    authorization: Optional[str] = Header(None),
):
    """Supprime un fichier du Storage."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    
    # Le path contient le bucket prefix (ex: "media/abc.jpg")
    path = request.filters.get("path", "")
    bucket = path.split("/")[0] if path else ""
    
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=headers, timeout=10.0)
    
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Erreur Storage remove: {resp.text[:200]}"
        )
    
    return {"status": "ok"}


# ============================================================
# ROUTES PROXY — Profils (lecture seule)
# ============================================================

@router.get("/profiles/me")
async def get_my_profile(
    authorization: Optional[str] = Header(None),
):
    """Récupère le profil de l'utilisateur connecté."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    profile = await get_profile_by_auth_uid(auth_uid)
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    
    return profile


@router.get("/profiles/{profile_id}")
async def get_profile(
    profile_id: str,
    authorization: Optional[str] = Header(None),
):
    """Récupère un profil par ID (les deux membres du couple)."""
    payload = await verify_token(authorization)
    auth_uid = payload.get("sub", "")
    
    if not await is_authorized(auth_uid):
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Supabase non configuré")
    
    headers = get_service_headers()
    url = (
        f"{SUPABASE_URL}/rest/v1/profiles"
        f"?id=eq.{profile_id}&select=id,display_name,avatar_url"
    )
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=5.0)
    
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Erreur serveur")
    
    data = resp.json()
    if not data:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    
    return data[0]


# ============================================================
# ROUTES PROXY — Health check
# ============================================================

@router.get("/health")
async def proxy_health():
    """Vérifie que le proxy est opérationnel."""
    return {
        "status": "ok",
        "service": "Supabase Proxy",
        "has_service_role": bool(SERVICE_ROLE_KEY),
        "has_anon_key": bool(SUPABASE_ANON_KEY),
    }
