# Cycle Tracker — Notre Bulle

Prédiction menstruelle en Python pour l'app Notre Bulle.

## Architecture

- `predictor.py` — Algorithme de prédiction (pur Python, sans dépendances)
- `main.py` — Serveur FastAPI (endpoints REST)
- `migration.sql` — Table Supabase `cycle_entries`
- Le frontend React stocke les entrées dans Supabase et appelle le serveur Python pour les prédictions

## Installation

```bash
cd cycle-tracker
pip install -r requirements.txt
```

## Démarrage

```bash
# Démarrer le serveur (dev)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Le serveur tourne sur `http://localhost:8000`.

## Endpoints

| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/entries` | Liste les entrées stockées en mémoire |
| POST | `/api/entries` | Ajoute une entrée |
| DELETE | `/api/entries/{id}` | Supprime une entrée |
| POST | `/api/predict` | Prédiction complète (body = entrées) |
| POST | `/api/demo/seed` | Données de démo (4 cycles ~28j) |

## Base de données

En production, les entrées sont stockées dans Supabase (table `cycle_entries`).
Exécutez `migration.sql` dans l'éditeur SQL Supabase pour créer la table.

Le serveur Python n'a pas besoin de se connecter à Supabase —
le frontend lui envoie les entrées directement dans le body de la requête.

## Algorithme de prédiction

1. Les jours de règles sont regroupés en cycles (écart > 5j = nouveau cycle)
2. La durée moyenne de cycle est calculée (médiane si ≥ 3 cycles)
3. L'ovulation est estimée : prochaines règles − 14 jours
4. Fenêtre fertile : ovulation − 5j → ovulation + 1j
5. La fiabilité augmente avec le nombre de cycles enregistrés

## Variables d'environnement

- `VITE_PYTHON_API_URL` — URL du serveur Python (défaut: `http://localhost:8000`)
