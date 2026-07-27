// ============================================================
// Cycle Tracker — Client API (Python backend + Supabase)
// ============================================================
import { supabase } from './supabase';

// --- Configuration ---
// L'API Python tourne sur Vercel au même domaine que le frontend.
// En dev local, on utilise /api/* via le proxy Vite ou le serveur local.
const PYTHON_API_URL = ''; // Route relative (même domaine)

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
  const { error } = await supabase.from('cycle_entries').insert(
    {
      profile_id: entry.profile_id,
      event_date: entry.event_date,
      event_type: entry.event_type,
      notes: entry.notes || null,
    },
    {
      onConflict: 'profile_id,event_date,event_type',
      ignoreDuplicates: true,
    }
  );
  if (error) {
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

export async function getCycleEntries(
  profileId: string
): Promise<CycleEntry[]> {
  const { data, error } = await supabase
    .from('cycle_entries')
    .select('*')
    .eq('profile_id', profileId)
    .order('event_date', { ascending: false })
    .limit(500);
  if (error) {
    console.warn('Erreur chargement entrées cycle:', error.message);
    return [];
  }
  return (data || []) as CycleEntry[];
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

// --- Python API ---

export async function fetchPredictions(
  entries: CycleEntry[],
  periodLength: number = 5
): Promise<PredictionResult | null> {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/predict`, {
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
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err: any) {
    console.warn('API Python indisponible:', err.message);
    return null;
  }
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
  month: number, // 0-indexed (0 = January)
  phaseDays: Map<string, 'period' | 'fertile' | 'ovulation' | 'normal'>,
  markedPeriods: Set<string> // dates YYYY-MM-DD marquées par l'utilisatrice
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

  // Jours du mois précédent (pour remplir la première semaine)
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1);
    week.push(createCalendarDay(d, false, today, phaseDays, markedPeriods));
  }

  // Jours du mois courant
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    week.push(createCalendarDay(date, true, today, phaseDays, markedPeriods));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  // Jours du mois suivant (pour remplir la dernière semaine)
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
