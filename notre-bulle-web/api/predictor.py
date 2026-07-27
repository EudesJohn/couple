# ============================================================
# Cycle Predictor — Vercel Serverless
# Notre Bulle — Python / Algorithme de prédiction menstruelle
# ============================================================
from datetime import datetime, timedelta, date as Date
from typing import List, Tuple, Optional, Dict
from statistics import median, stdev

# === Configuration par défaut ===

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5
LUTEAL_PHASE_DAYS = 14
MIN_PERIOD_GAP_DAYS = 5
MIN_CYCLES_FOR_PREDICTION = 2
MAX_CYCLE_LENGTH = 45
MIN_CYCLE_LENGTH = 20


# === Algorithme ===


def get_period_dates(entries: List[Dict]) -> List[Date]:
    dates = set()
    for e in entries:
        if e.get("event_type") == "period":
            try:
                d = datetime.strptime(e["event_date"], "%Y-%m-%d").date()
                dates.add(d)
            except (ValueError, KeyError):
                continue
    return sorted(dates)


def group_periods(dates: List[Date], min_gap: int = MIN_PERIOD_GAP_DAYS) -> List[List[Date]]:
    if not dates:
        return []
    groups: List[List[Date]] = [[dates[0]]]
    for d in dates[1:]:
        last = groups[-1][-1]
        if (d - last).days <= min_gap:
            groups[-1].append(d)
        else:
            groups.append([d])
    return groups


def get_period_starts(groups: List[List[Date]]) -> List[Date]:
    return [g[0] for g in groups]


def get_cycle_lengths(starts: List[Date]) -> List[int]:
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


def compute_std_dev(lengths: List[int]) -> Optional[float]:
    if len(lengths) >= 2:
        try:
            return stdev(lengths)
        except ValueError:
            return None
    return None


def predict_next_period(last_start: Date, avg_cycle: float) -> Date:
    return last_start + timedelta(days=round(avg_cycle))


def predict_ovulation(next_period_start: Date) -> Date:
    return next_period_start - timedelta(days=LUTEAL_PHASE_DAYS)


def predict_fertile_window(ovulation_date: Date) -> Tuple[Date, Date]:
    start = ovulation_date - timedelta(days=5)
    end = ovulation_date + timedelta(days=1)
    return start, end


def get_period_days(period_start: Date, period_length: int = DEFAULT_PERIOD_LENGTH) -> List[Date]:
    return [period_start + timedelta(days=i) for i in range(period_length)]


def generate_phase_days(
    period_start: Date,
    next_period_start: Date,
    ovulation_date: Date,
    fertile_start: Date,
    fertile_end: Date,
    period_length: int = DEFAULT_PERIOD_LENGTH,
) -> List[Dict]:
    days: List[Dict] = []
    current = period_start
    period_days_set = set(get_period_days(period_start, period_length))

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
            return {
                "in_cycle": True,
                "cycle_day": cycle_day,
                "cycle_length": (end - start).days,
                "phase": phase,
            }
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
                return {
                    "date": day["date"],
                    "phase": phase,
                    "days_remaining": (event_date - today).days,
                }
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


def _describe_regularity(std_dev):
    if std_dev is None:
        return "insuffisant"
    if std_dev <= 2:
        return "très régulier"
    if std_dev <= 4:
        return "régulier"
    if std_dev <= 7:
        return "modérément régulier"
    return "irrégulier"


def _compute_reliability(lengths, filtered, avg_cycle):
    score = 0
    n = len(filtered)
    if n >= 6:
        score += 40
    elif n >= 4:
        score += 30
    elif n >= 2:
        score += 15
    elif n >= 1:
        score += 5
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


def _reliability_message(score, cycle_count):
    if score >= 70:
        return f"Prédictions fiables basées sur {cycle_count} cycles analysés."
    if score >= 40:
        return f"Prédictions moyennes — ajoutez encore {max(0, 4 - cycle_count)} cycles pour affiner."
    if cycle_count == 0:
        return "Marquez vos règles pour commencer les prédictions."
    if cycle_count == 1:
        return "Un seul cycle enregistré. La prédiction s'améliorera avec plus de données."
    return "Données insuffisantes pour des prédictions fiables."


# === API publique ===

def predict_full(
    entries: List[Dict],
    period_length: int = DEFAULT_PERIOD_LENGTH,
    num_predictions: int = 3,
) -> Dict:
    period_dates = get_period_dates(entries)
    groups = group_periods(period_dates)
    starts = get_period_starts(groups)
    lengths = get_cycle_lengths(starts)
    lengths_filtered = filter_cycle_lengths(lengths)
    avg_cycle = compute_average_cycle(lengths_filtered)
    std_dev = compute_std_dev(lengths_filtered)

    past_cycles = _build_past_cycles(starts, groups, avg_cycle, period_length)

    last_start = starts[-1] if starts else Date.today()
    future_cycles = _build_future_cycles(last_start, avg_cycle, num_predictions, period_length)

    today = Date.today()
    current_phase = _get_current_phase(today, past_cycles, future_cycles, avg_cycle)
    next_event = _get_next_event(today, past_cycles, future_cycles)
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
