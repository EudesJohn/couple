// ============================================================
// Cycle Tracker — Client API (Supabase + prédiction locale)
// Portage de notre-bulle-web/src/lib/cycleApi.ts — MÊME base de
// données (table `cycle_entries`), mêmes règles de calcul.
//
// Sur mobile, l'API Python n'est pas sur le même domaine que l'app :
// la prédiction SERVEUR n'est utilisée que si une URL absolue est
// fournie (apiBaseUrl). Sinon, la prédiction LOCALE (identique à la
// logique Python) sert de source de vérité — 100% hors-ligne.
// ============================================================
import { supabase } from './supabase';

// --- Types ---

export interface CycleEntry {
  id?: string;
  profile_id: string;
  event_date: string; // YYYY-MM-DD
  event_type: 'period' | 'symptom' | 'note';
  notes?: string | null;
  created_at?: string;
}

export interface PredictionResult {
  past_cycles: PastCycle[];
  future_cycles: FutureCycle[];
  current_phase: CurrentPhase | null;
  next_event: NextEvent | null;
  stats: CycleStats;
  today: string;
}

export interface PastCycle {
  cycle_number: number;
  start_date: string;
  end_date: string;
  length_days: number | null;
  period_days_recorded: string[];
  predicted: boolean;
}

export interface FutureCycle {
  cycle_number: string;
  start_date: string;
  end_date: string;
  length_days: number;
  ovulation_date: string;
  fertile_window: { start: string; end: string };
  days: PhaseDay[];
  predicted: boolean;
}

export interface PhaseDay {
  date: string;
  phase: 'period' | 'fertile' | 'ovulation' | 'normal';
}

export interface CurrentPhase {
  in_cycle: boolean;
  cycle_day?: number;
  cycle_length?: number;
  phase?: string;
  predicted?: boolean;
}

export interface NextEvent {
  date: string;
  phase: string;
  days_remaining: number;
}

export interface CycleStats {
  cycle_count: number;
  average_cycle_days: number;
  std_dev_days: number | null;
  min_cycle: number | null;
  max_cycle: number | null;
  last_period_start: string | null;
  cycle_regularity: string;
  reliability: {
    score: number;
    level: string;
    cycles_analyzed: number;
    message: string;
  };
  period_length_days: number;
}

// --- Supabase CRUD ---

export async function saveCycleEntry(entry: CycleEntry): Promise<boolean> {
  // upsert + ignoreDuplicates = "insert ou ignore si déjà présent"
  const { error } = await supabase.from('cycle_entries').upsert(
    {
      profile_id: entry.profile_id,
      event_date: entry.event_date,
      event_type: entry.event_type,
      notes: entry.notes || null,
    },
    { onConflict: 'profile_id,event_date,event_type', ignoreDuplicates: true }
  );
  if (error) {
    // 23505 = duplicate key → déjà marqué, pas une erreur
    if ((error as any).code === '23505') return true;
    console.warn('Erreur sauvegarde entrée cycle:', error.message);
    return false;
  }
  return true;
}

export async function deleteCycleEntry(
  profileId: string,
  eventDate: string,
  eventType: string = 'period'
): Promise<boolean> {
  const { error } = await supabase
    .from('cycle_entries')
    .delete()
    .eq('profile_id', profileId)
    .eq('event_date', eventDate)
    .eq('event_type', eventType);
  if (error) {
    console.warn('Erreur suppression entrée cycle:', error.message);
    return false;
  }
  return true;
}

export async function getCycleEntriesByProfileIds(
  profileIds: string[]
): Promise<CycleEntry[]> {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cycle_entries')
    .select('*')
    .in('profile_id', profileIds)
    .order('event_date', { ascending: false })
    .limit(500);
  if (error) {
    console.warn('Erreur chargement entrées cycle:', error.message);
    return [];
  }
  return (data || []) as CycleEntry[];
}

// --- Prédiction serveur (optionnelle) ---
// Nécessite une URL ABSOLUE vers l'API (ex: https://notre-bulle-web.vercel.app).
// Sans URL → renvoie null et la prédiction locale prend le relais.

export async function fetchPredictions(
  entries: CycleEntry[],
  periodLength: number = 5,
  today?: string,
  apiBaseUrl?: string
): Promise<PredictionResult | null> {
  const baseUrl = apiBaseUrl?.replace(/\/$/, '');
  if (!baseUrl) return null; // Pas d'API configurée → prédiction locale
  try {
    const response = await fetch(`${baseUrl}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((e) => ({
          profile_id: e.profile_id,
          event_date: e.event_date,
          event_type: e.event_type,
          notes: e.notes,
        })),
        period_length: periodLength,
        num_predictions: 3,
        today,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err: any) {
    console.warn('API cycle indisponible:', err.message);
    return null;
  }
}

// --- Prédiction locale (source de vérité) ---
// Portage TypeScript de la logique Python (api/index.py) — identique au web.

const LOCAL_CYCLE_LENGTH = 28;
const LOCAL_PERIOD_LENGTH = 5;
const LUTEAL_DAYS = 14;
const MIN_PERIOD_GAP = 5;
const MIN_CYCLE_LENGTH = 20;
const MAX_CYCLE_LENGTH = 45;

function parseLocalDate(dateStr: string): Date {
  // Parse "YYYY-MM-DD" en minuit LOCAL (évite le décalage de fuseau).
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysLocal(dateStr: string, days: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return formatDateStr(dt);
}

function diffDaysLocal(a: string, b: string): number {
  const aMs = parseLocalDate(a).getTime();
  const bMs = parseLocalDate(b).getTime();
  return Math.round((bMs - aMs) / 86400000);
}

function medianSortedLocal(arr: number[]): number {
  const n = arr.length;
  if (n % 2 === 1) return arr[(n - 1) / 2];
  return (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

function averageCycleLocal(lengths: number[]): number {
  if (lengths.length === 0) return LOCAL_CYCLE_LENGTH;
  if (lengths.length === 1) return lengths[0];
  if (lengths.length === 2) return (lengths[0] + lengths[1]) / 2;
  return medianSortedLocal([...lengths].sort((a, b) => a - b));
}

function reliabilityLocal(lengths: number[]): CycleStats['reliability'] {
  let score = 0;
  const n = lengths.length;
  if (n >= 6) score += 40;
  else if (n >= 4) score += 30;
  else if (n >= 2) score += 15;
  else if (n >= 1) score += 5;
  if (n >= 2) {
    const mean = lengths.reduce((a, b) => a + b, 0) / n;
    const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    if (sd <= 2) score += 40;
    else if (sd <= 4) score += 30;
    else if (sd <= 7) score += 15;
    else score += 5;
  }
  let level: string;
  let message: string;
  if (score >= 70) {
    level = 'fiable';
    message = `Prédictions fiables basées sur ${n} cycles analysés.`;
  } else if (score >= 40) {
    level = 'moyen';
    message = `Prédictions moyennes — ajoutez encore ${Math.max(0, 4 - n)} cycles pour affiner.`;
  } else if (n === 0) {
    level = 'faible';
    message = 'Marquez vos règles pour commencer les prédictions.';
  } else if (n === 1) {
    level = 'faible';
    message = "Un seul cycle enregistré. La prédiction s'améliorera avec plus de données.";
  } else {
    level = 'faible';
    message = 'Données insuffisantes pour des prédictions fiables.';
  }
  return { score: Math.min(score, 100), level, cycles_analyzed: n, message };
}

/**
 * Calcule une prédiction complète localement, sans appel réseau.
 * Renvoie null si aucun jour de règles n'est marqué.
 */
export function computeLocalPrediction(entries: CycleEntry[]): PredictionResult | null {
  const periodDates = entries
    .filter((e) => e.event_type === 'period')
    .map((e) => e.event_date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (periodDates.length === 0) return null;

  // Grouper les jours consécutifs (écart ≤ 5 j) en périodes distinctes.
  const groups: string[][] = [];
  for (const d of periodDates) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && diffDaysLocal(lastGroup[lastGroup.length - 1], d) <= MIN_PERIOD_GAP) {
      lastGroup.push(d);
    } else {
      groups.push([d]);
    }
  }

  const starts = groups.map((g) => g[0]);
  const lengths: number[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const len = diffDaysLocal(starts[i], starts[i + 1]);
    if (len >= MIN_CYCLE_LENGTH && len <= MAX_CYCLE_LENGTH) lengths.push(len);
  }
  const avgCycle = averageCycleLocal(lengths);
  const avgRounded = Math.round(avgCycle);

  const todayStr = formatDateStr(new Date());

  // Cycles passés (début de chaque groupe enregistré)
  const pastCycles: PastCycle[] = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : addDaysLocal(s, avgRounded);
    return {
      cycle_number: i + 1,
      start_date: s,
      end_date: end,
      length_days: i + 1 < starts.length ? diffDaysLocal(s, starts[i + 1]) : null,
      period_days_recorded: groups[i] || [],
      predicted: false,
    };
  });

  // Cycles futurs prédits
  const futureCycles: FutureCycle[] = [];
  let currentStart = starts[starts.length - 1];
  for (let i = 0; i < 3; i++) {
    const nextStart = addDaysLocal(currentStart, avgRounded);
    const ovulation = addDaysLocal(nextStart, -LUTEAL_DAYS);
    const fertileStart = addDaysLocal(ovulation, -5);
    const fertileEnd = addDaysLocal(ovulation, 1);
    const days: PhaseDay[] = [];
    let cur = currentStart;
    let guard = 0;
    while (cur < nextStart && guard < 90) {
      const dayIdx = diffDaysLocal(currentStart, cur);
      let phase: PhaseDay['phase'] = 'normal';
      if (dayIdx >= 0 && dayIdx < LOCAL_PERIOD_LENGTH) phase = 'period';
      else if (cur === ovulation) phase = 'ovulation';
      else if (cur >= fertileStart && cur <= fertileEnd) phase = 'fertile';
      days.push({ date: cur, phase });
      cur = addDaysLocal(cur, 1);
      guard++;
    }
    futureCycles.push({
      cycle_number: `Prédit ${i + 1}`,
      start_date: currentStart,
      end_date: nextStart,
      length_days: avgRounded,
      ovulation_date: ovulation,
      fertile_window: { start: fertileStart, end: fertileEnd },
      days,
      predicted: true,
    });
    currentStart = nextStart;
  }

  // Phase actuelle — miroir de _get_current_phase (api/index.py)
  let currentPhase: CurrentPhase = { in_cycle: false, phase: 'unknown' };
  let cycleStart = '';
  for (const s of starts) {
    if (s <= todayStr) cycleStart = s;
  }
  if (cycleStart) {
    const cycleDay = diffDaysLocal(cycleStart, todayStr) + 1;
    const cycleEnd = addDaysLocal(cycleStart, avgRounded);
    if (todayStr < cycleEnd && cycleDay >= 1) {
      let phase: string;
      if (diffDaysLocal(cycleStart, todayStr) <= LOCAL_PERIOD_LENGTH) {
        phase = 'period';
      } else {
        const ovulation = addDaysLocal(cycleEnd, -LUTEAL_DAYS);
        const fertileStart = addDaysLocal(ovulation, -5);
        const fertileEnd = addDaysLocal(ovulation, 1);
        if (todayStr === ovulation) phase = 'ovulation';
        else if (todayStr >= fertileStart && todayStr <= fertileEnd) phase = 'fertile';
        else phase = 'normal';
      }
      currentPhase = {
        in_cycle: true,
        cycle_day: cycleDay,
        cycle_length: avgRounded,
        phase,
      };
    }
  }

  // Prochain événement — ignore la période en cours (miroir de _get_next_event)
  let nextEvent: NextEvent | null = null;
  let prevWasPeriod = false;
  for (const cycle of futureCycles) {
    for (const day of cycle.days) {
      if (day.date <= todayStr) {
        prevWasPeriod = day.phase === 'period';
        continue;
      }
      if (day.phase === 'period' && prevWasPeriod) {
        prevWasPeriod = true;
        continue;
      }
      if (day.phase === 'period' || day.phase === 'ovulation' || day.phase === 'fertile') {
        nextEvent = {
          date: day.date,
          phase: day.phase,
          days_remaining: diffDaysLocal(todayStr, day.date),
        };
        break;
      }
      prevWasPeriod = false;
    }
    if (nextEvent) break;
  }
  // Repli : prochain début de cycle prédit
  if (!nextEvent) {
    for (const cycle of futureCycles) {
      if (cycle.start_date > todayStr) {
        nextEvent = {
          date: cycle.start_date,
          phase: 'period',
          days_remaining: diffDaysLocal(todayStr, cycle.start_date),
        };
        break;
      }
    }
  }

  const stdDev =
    lengths.length >= 2
      ? (() => {
          const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
          const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / (lengths.length - 1);
          return Math.sqrt(variance);
        })()
      : null;
  const regularity =
    stdDev === null
      ? 'insuffisant'
      : stdDev <= 2
        ? 'très régulier'
        : stdDev <= 4
          ? 'régulier'
          : stdDev <= 7
            ? 'modérément régulier'
            : 'irrégulier';

  const stats: CycleStats = {
    cycle_count: lengths.length,
    average_cycle_days: Math.round(avgCycle * 10) / 10,
    std_dev_days: stdDev !== null ? Math.round(stdDev * 10) / 10 : null,
    min_cycle: lengths.length ? Math.min(...lengths) : null,
    max_cycle: lengths.length ? Math.max(...lengths) : null,
    last_period_start: starts[starts.length - 1] || null,
    cycle_regularity: regularity,
    reliability: reliabilityLocal(lengths),
    period_length_days: LOCAL_PERIOD_LENGTH,
  };

  return {
    past_cycles: pastCycles,
    future_cycles: futureCycles,
    current_phase: currentPhase,
    next_event: nextEvent,
    stats,
    today: todayStr,
  };
}

/**
 * Phase actuelle locale depuis les jours de règles marqués.
 * Source de vérité pour la TodayCard (« Règles » si aujourd'hui est marqué).
 */
export function computeLocalCurrentPhase(
  periodDays: Set<string>,
  todayStr: string
): CurrentPhase | null {
  if (!periodDays.has(todayStr)) return null;
  const marked = [...periodDays].filter((d) => d <= todayStr).sort();
  // Remonter au début du groupe de règles en cours (écarts ≤ 5 j).
  let start = todayStr;
  let idx = marked.indexOf(todayStr);
  while (idx > 0 && diffDaysLocal(marked[idx - 1], marked[idx]) <= MIN_PERIOD_GAP) {
    idx -= 1;
    start = marked[idx];
  }
  return {
    in_cycle: true,
    cycle_day: diffDaysLocal(start, todayStr) + 1,
    phase: 'period',
  };
}

// --- Utilitaires pour le calendrier ---

export interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  phase: 'period' | 'fertile' | 'ovulation' | 'normal';
  isPeriodMarked: boolean;
}

export function generateCalendarGrid(
  year: number,
  month: number, // 0-indexed (0 = janvier)
  phaseDays: Map<string, 'period' | 'fertile' | 'ovulation' | 'normal'>,
  markedPeriods: Set<string>
): CalendarDay[][] {
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Jour de la semaine du premier jour (0 = Dimanche en JS)
  let startDow = firstDay.getDay();
  // Convertir en Lundi = 0
  startDow = startDow === 0 ? 6 : startDow - 1;

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1);
    week.push(createCalendarDay(d, false, today, phaseDays, markedPeriods));
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    week.push(createCalendarDay(date, true, today, phaseDays, markedPeriods));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    let nextDay = 1;
    while (week.length < 7) {
      const d = new Date(year, month + 1, nextDay++);
      week.push(createCalendarDay(d, false, today, phaseDays, markedPeriods));
    }
    weeks.push(week);
  }

  return weeks;
}

function createCalendarDay(
  date: Date,
  isCurrentMonth: boolean,
  today: Date,
  phaseDays: Map<string, 'period' | 'fertile' | 'ovulation' | 'normal'>,
  markedPeriods: Set<string>
): CalendarDay {
  const dateStr = formatDateStr(date);
  const phase = phaseDays.get(dateStr) || 'normal';
  const isPeriodMarked = markedPeriods.has(dateStr);

  return {
    date,
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
    isCurrentMonth,
    isToday:
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear(),
    phase,
    isPeriodMarked,
  };
}

export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const PHASE_COLORS: Record<string, string> = {
  period: '#DC2626', // Rouge — règles
  fertile: '#F59E0B', // Orange/Ambre — fenêtre fertile
  ovulation: '#8B5CF6', // Violet — ovulation
  normal: 'transparent',
};

export const PHASE_LABELS: Record<string, string> = {
  period: 'Règles',
  fertile: 'Fertile',
  ovulation: 'Ovulation',
  normal: 'Normal',
};
