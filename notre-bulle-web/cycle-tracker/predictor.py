# ============================================================
# Cycle Predictor — Algorithme de prédiction menstruelle
# Notre Bulle — Python
# ============================================================
# Prend une liste de dates de règles (début de cycle),
# calcule la durée moyenne du cycle, prédit les prochaines
# règles, l'ovulation et la fenêtre fertile.
# ============================================================
from datetime import datetime, timedelta, date
from typing import List, Tuple, Optional, Dict
from statistics import median, stdev
import math

# === Types ===

CycleEntry = Dict[str, str]  # {"event_date": "2026-01-15", "event_type": "period"}
PhaseDay = Dict[str, str]    # {"date": "2026-01-15", "phase": "period"}


# === Configuration par défaut ===

DEFAULT_CYCLE_LENGTH = 28       # jours (utilisé si < 2 cycles)
DEFAULT_PERIOD_LENGTH = 5       # jours (durée moyenne des règles)
LUTEAL_PHASE_DAYS = 14          # jours (phase lutéale, quasi constante)
MIN_PERIOD_GAP_DAYS = 5         # écart min pour séparer deux cycles
MIN_CYCLES_FOR_PREDICTION = 2   # cycles minimum pour une prédiction fiable
MAX_CYCLE_LENGTH = 45           # cycle max acceptable
MIN_CYCLE_LENGTH = 20           # cycle min acceptable


# === Cœur de l'algorithme ===


def get_period_dates(entries: List[CycleEntry]) -> List[date]:
    """Extrait les dates de règles depuis les entrées brutes.

    entry = {"event_date": "2026-01-15", "event_type": "period"}
    Retourne une liste de dates (pas de doublons, triées).
    """
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
    """Regroupe les jours de règles consécutifs en cycles.

    Si l'écart entre deux dates > min_gap jours, on considère
    qu'il s'agit d'un nouveau cycle.
    """
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


def get_period_starts(groups: List[List[date]]) -> List[date]:
    """Extrait le premier jour de chaque groupe = début de cycle."""
    return [g[0] for g in groups]


def get_cycle_lengths(starts: List[date]) -> List[int]:
    """Calcule les durées de cycle (en jours) entre chaque début."""
    if len(starts) < 2:
        return []
    return [(starts[i+1] - starts[i]).days for i in range(len(starts) - 1)]


def filter_cycle_lengths(lengths: List[int]) -> List[int]:
    """Supprime les cycles aberrants (trop courts ou trop longs)."""
    return [l for l in lengths if MIN_CYCLE_LENGTH <= l <= MAX_CYCLE_LENGTH]


def compute_average_cycle(lengths: List[int]) -> float:
    """Calcule la durée moyenne de cycle.

    Si >= 3 cycles : utilise la médiane (plus robuste)
    Si 2 cycles   : utilise la moyenne
    Si < 2 cycles : retourne la valeur par défaut
    """
    if not lengths:
        return DEFAULT_CYCLE_LENGTH
    if len(lengths) == 1:
        return float(lengths[0])
    if len(lengths) == 2:
        return float(sum(lengths)) / len(lengths)
    return median(lengths)


def compute_std_dev(lengths: List[int]) -> Optional[float]:
    """Écart-type des durées de cycle (indice de régularité)."""
    if len(lengths) >= 2:
        try:
            return stdev(lengths)
        except ValueError:
            return None
    return None


def predict_next_period(
    last_start: date,
    avg_cycle: float,
) -> date:
    """Prédit le prochain début de règles."""
    return last_start + timedelta(days=round(avg_cycle))


def predict_ovulation(next_period_start: date) -> date:
    """Prédit la date d'ovulation.

    L'ovulation a lieu environ 14 jours avant le début des règles
    (phase lutéale fixe).
    """
    return next_period_start - timedelta(days=LUTEAL_PHASE_DAYS)


def predict_fertile_window(ovulation_date: date) -> Tuple[date, date]:
    """Fenêtre fertile : ~5 jours avant ovulation + 1 jour après.

    Les spermatozoïdes peuvent survivre ~5 jours dans l'utérus,
    l'ovule vit ~24h après l'ovulation.
    """
    start = ovulation_date - timedelta(days=5)
    end = ovulation_date + timedelta(days=1)
    return start, end


def get_period_days(
    period_start: date,
    period_length: int = DEFAULT_PERIOD_LENGTH
) -> List[date]:
    """Génère les jours de règles pour un cycle donné."""
    return [period_start + timedelta(days=i) for i in range(period_length)]


def generate_phase_days(
    period_start: date,
    next_period_start: date,
    ovulation_date: date,
    fertile_start: date,
    fertile_end: date,
    period_length: int = DEFAULT_PERIOD_LENGTH,
) -> List[PhaseDay]:
    """Génère la liste de tous les jours du cycle avec leur phase.

    Phases :
      - 'period'    → règles (jours 1 à period_length)
      - 'fertile'   → fenêtre fertile (5j avant ovulation + 1j après)
      - 'ovulation' → jour d'ovulation
      - 'normal'    → reste du cycle
    """
    days: List[PhaseDay] = []
    current = period_start
    period_days = set(get_period_days(period_start, period_length))

    while current < next_period_start:
        day_str = current.isoformat()
        if current in period_days:
            days.append({"date": day_str, "phase": "period"})
        elif current == ovulation_date:
            days.append({"date": day_str, "phase": "ovulation"})
        elif fertile_start <= current <= fertile_end:
            days.append({"date": day_str, "phase": "fertile"})
        else:
            days.append({"date": day_str, "phase": "normal"})
        current += timedelta(days=1)

    return days


# === API publique ===


def predict_full(
    entries: List[CycleEntry],
    period_length: int = DEFAULT_PERIOD_LENGTH,
    num_predictions: int = 3,
) -> Dict:
    """Prédiction complète du cycle.

    Args:
        entries: Liste des entrées (périodes marquées)
        period_length: Durée typique des règles (en jours)
        num_predictions: Nombre de cycles à prédire dans le futur

    Returns:
        Dictionnaire avec :
          - past_cycles: liste des cycles passés avec leurs phases
          - future_cycles: liste des cycles prédits
          - stats: statistiques (cycle moyen, écart-type, fiabilité)
          - current_phase: phase en cours (si dans un cycle)
          - next_event: prochain événement important
    """
    # 1. Extraire et grouper les dates de règles
    period_dates = get_period_dates(entries)
    groups = group_periods(period_dates)
    starts = get_period_starts(groups)

    # 2. Calculer les statistiques
    lengths = get_cycle_lengths(starts)
    lengths_filtered = filter_cycle_lengths(lengths)
    avg_cycle = compute_average_cycle(lengths_filtered)
    std_dev = compute_std_dev(lengths_filtered)

    # 3. Construire les cycles passés
    past_cycles = _build_past_cycles(starts, groups, avg_cycle, period_length)

    # 4. Prédire les cycles futurs
    last_start = starts[-1] if starts else date.today()
    future_cycles = _build_future_cycles(last_start, avg_cycle, num_predictions, period_length)

    # 5. Déterminer la phase actuelle
    today = date.today()
    current_phase = _get_current_phase(today, past_cycles, future_cycles, avg_cycle)

    # 6. Prochain événement
    next_event = _get_next_event(today, past_cycles, future_cycles)

    # 7. Fiabilité
    reliability = _compute_reliability(lengths, lengths_filtered, avg_cycle)

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
            "cycle_regularity": _describe_regularity(std_dev),
            "reliability": reliability,
            "period_length_days": period_length,
        },
        "today": today.isoformat(),
    }


# === Fonctions internes ===


def _build_past_cycles(
    starts: List[date],
    groups: List[List[date]],
    avg_cycle: float,
    period_length: int,
) -> List[Dict]:
    """Construit les cycles passés avec leurs jours détaillés."""
    cycles = []
    for i, start in enumerate(starts):
        # Fin de ce cycle = début du suivant OU prédiction
        if i + 1 < len(starts):
            end = starts[i + 1]
        else:
            end = predict_next_period(start, avg_cycle)

        # Les jours de règles effectifs (marqués)
        period_days_recorded = [d.isoformat() for d in groups[i]] if i < len(groups) else []

        cycle_data = {
            "cycle_number": i + 1,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "length_days": (end - start).days if i + 1 < len(starts) else None,
            "period_days_recorded": period_days_recorded,
            "predicted": False,
        }
        cycles.append(cycle_data)

    return cycles


def _build_future_cycles(
    last_start: date,
    avg_cycle: float,
    num_predictions: int,
    period_length: int,
) -> List[Dict]:
    """Génère les cycles futurs prédits."""
    cycles = []
    current_start = last_start

    for i in range(num_predictions):
        next_start = predict_next_period(current_start, avg_cycle)
        ovulation = predict_ovulation(next_start)
        fertile_start, fertile_end = predict_fertile_window(ovulation)
        days = generate_phase_days(
            current_start, next_start, ovulation,
            fertile_start, fertile_end, period_length
        )

        cycles.append({
            "cycle_number": f"Prédit {i + 1}",
            "start_date": current_start.isoformat(),
            "end_date": next_start.isoformat(),
            "length_days": (next_start - current_start).days,
            "ovulation_date": ovulation.isoformat(),
            "fertile_window": {
                "start": fertile_start.isoformat(),
                "end": fertile_end.isoformat(),
            },
            "days": days,
            "predicted": True,
        })
        current_start = next_start

    return cycles


def _get_current_phase(
    today: date,
    past_cycles: List[Dict],
    future_cycles: List[Dict],
    avg_cycle: float,
) -> Optional[Dict]:
    """Trouve la phase actuelle du cycle.

    Parcourt les cycles passés et futurs pour voir où
    se situe aujourd'hui.
    """
    # Chercher dans les cycles passés
    for cycle in past_cycles:
        start = datetime.strptime(cycle["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(cycle["end_date"], "%Y-%m-%d").date()
        if start <= today < end:
            return {
                "in_cycle": True,
                "cycle_day": (today - start).days + 1,
                "cycle_length": (end - start).days,
                "phase": _predict_single_day_phase(today, start, end, avg_cycle),
            }

    # Chercher dans les cycles futurs
    for cycle in future_cycles:
        start = datetime.strptime(cycle["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(cycle["end_date"], "%Y-%m-%d").date()
        if start <= today < end:
            return {
                "in_cycle": True,
                "cycle_day": (today - start).days + 1,
                "cycle_length": (end - start).days,
                "phase": cycle["days"][(today - start).days]["phase"] if isinstance(cycle.get("days"), list) and (today - start).days < len(cycle["days"]) else "normal",
                "predicted": True,
            }

    return {"in_cycle": False, "phase": "unknown"}


def _predict_single_day_phase(
    day: date,
    cycle_start: date,
    cycle_end: date,
    avg_cycle: float,
) -> str:
    """Détermine la phase d'un jour donné dans un cycle.

    Utilisé quand on n'a pas la liste complète des jours.
    """
    cycle_day = (day - cycle_start).days + 1  # 1-indexed
    period_end = cycle_start + timedelta(days=DEFAULT_PERIOD_LENGTH)
    if day <= period_end:
        return "period"
    # Ovulation estimée : ~14 jours avant la fin du cycle
    ovulation = cycle_end - timedelta(days=LUTEAL_PHASE_DAYS)
    fertile_start = ovulation - timedelta(days=5)
    fertile_end = ovulation + timedelta(days=1)
    if fertile_start <= day <= fertile_end:
        return "fertile"
    if day == ovulation:
        return "ovulation"
    return "normal"


def _get_next_event(
    today: date,
    past_cycles: List[Dict],
    future_cycles: List[Dict],
) -> Optional[Dict]:
    """Trouve le prochain événement important."""
    today_str = today.isoformat()

    for cycle in future_cycles:
        if not cycle.get("days"):
            continue
        for day in cycle["days"]:
            if day["date"] < today_str:
                continue
            phase = day.get("phase", "normal")
            if phase in ("period", "ovulation", "fertile") and day["date"] > today_str:
                return {
                    "date": day["date"],
                    "phase": phase,
                    "days_remaining": (datetime.strptime(day["date"], "%Y-%m-%d").date() - today).days,
                }

    # Fallback : prochaines règles prédites
    if future_cycles:
        next_start_str = future_cycles[0].get("start_date", "")
        if next_start_str:
            next_start = datetime.strptime(next_start_str, "%Y-%m-%d").date()
            if next_start > today:
                return {
                    "date": next_start_str,
                    "phase": "period",
                    "days_remaining": (next_start - today).days,
                }

    return None


def _describe_regularity(std_dev: Optional[float]) -> str:
    """Décrit la régularité du cycle à partir de l'écart-type."""
    if std_dev is None:
        return "insuffisant"
    if std_dev <= 2:
        return "très régulier"
    if std_dev <= 4:
        return "régulier"
    if std_dev <= 7:
        return "modérément régulier"
    return "irrégulier"


def _compute_reliability(
    lengths: List[int],
    filtered: List[int],
    avg_cycle: float,
) -> Dict:
    """Calcule un score de fiabilité des prédictions (0-100)."""
    score = 0

    # NB de cycles (poids: 40%)
    n = len(filtered)
    if n >= 6:
        score += 40
    elif n >= 4:
        score += 30
    elif n >= 2:
        score += 15
    elif n >= 1:
        score += 5

    # Régularité (poids: 40%)
    if filtered:
        try:
            sd = stdev(filtered)
            if sd <= 2:
                score += 40
            elif sd <= 4:
                score += 30
            elif sd <= 7:
                score += 15
            else:
                score += 5
        except ValueError:
            pass

    # Qualité des données (poids: 20%)
    if lengths:
        rejection_rate = 1 - (len(filtered) / len(lengths))
        if rejection_rate == 0:
            score += 20
        elif rejection_rate <= 0.2:
            score += 15
        elif rejection_rate <= 0.5:
            score += 10
        else:
            score += 5

    return {
        "score": min(score, 100),
        "level": "fiable" if score >= 70 else "moyen" if score >= 40 else "faible",
        "cycles_analyzed": len(filtered),
        "message": _reliability_message(score, len(filtered)),
    }


def _reliability_message(score: int, cycle_count: int) -> str:
    """Message adapté au niveau de confiance."""
    if score >= 70:
        return f"Prédictions fiables basées sur {cycle_count} cycles analysés."
    if score >= 40:
        return f"Prédictions moyennes — ajoutez encore {max(0, 4 - cycle_count)} cycles pour affiner."
    if cycle_count == 0:
        return "Marquez vos règles pour commencer les prédictions."
    if cycle_count == 1:
        return "Un seul cycle enregistré. La prédiction s'améliorera avec plus de données."
    return "Données insuffisantes pour des prédictions fiables. Continuez à marquer vos cycles."
