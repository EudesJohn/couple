// ============================================================
// 📅 Cycle Tracker — Calendrier menstruel partagé
// Portage mobile de notre-bulle-web/src/pages/CycleCalendar.tsx
// Même base de données (`cycle_entries`), même logique de calcul.
// Design Burgundy & Gold.
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, borderRadius } from '../../src/constants/theme';
import { getOwnProfileId, getActualPartnerProfileId } from '../../src/lib/profile';
import { getIdentity } from '../../src/lib/auth';
import {
  getCycleEntriesByProfileIds,
  saveCycleEntry,
  deleteCycleEntry,
  computeLocalPrediction,
  computeLocalCurrentPhase,
  generateCalendarGrid,
  formatDateStr,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../../src/lib/cycleApi';
import type { CycleEntry, PredictionResult, CalendarDay } from '../../src/lib/cycleApi';
import {
  HeartFilledIcon, BackIcon, ChevronLeftIcon, ChevronRightIcon,
  PlusIcon, CheckIcon,
} from '../../src/components/Icons';

// ========== Constantes ==========

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ========== Hook — Données du calendrier ==========

function useCycleData() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CycleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canMark, setCanMark] = useState(false);

  // Réf pour éviter les closures obsolètes (race condition clic rapide → 409)
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const processingRef = useRef<Set<string>>(new Set());

  // Charger le profil + identité (seule la femme peut marquer les règles)
  useEffect(() => {
    (async () => {
      try {
        const id = await getOwnProfileId();
        setProfileId(id);
        if (!id) {
          setError("Profil non trouvé — verrouillez d'abord l'application.");
          setLoading(false);
          return;
        }
        const identity = await getIdentity();
        setCanMark(identity === 'woman');

        // Entrées des DEUX profils (calendrier partagé) — IDs depuis la
        // config pour éviter les problèmes de RLS (même approche que le web).
        const partnerId = await getActualPartnerProfileId();
        const allProfileIds = [id, partnerId].filter(Boolean) as string[];
        const allEntries = await getCycleEntriesByProfileIds(allProfileIds);
        setEntries(allEntries);
      } catch (err: any) {
        console.warn('Erreur chargement données cycle:', err);
        setError(err?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Prédiction locale immédiate — source de vérité, aucun round-trip réseau
  const localPrediction = useMemo(() => computeLocalPrediction(entries), [entries]);
  const prediction: PredictionResult | null = localPrediction;

  const togglePeriodDay = useCallback(async (dateStr: string) => {
    if (!profileId) return false;

    // Verrouillage anti-doublon : ignorer si déjà en cours
    if (processingRef.current.has(dateStr)) return true;
    processingRef.current.add(dateStr);

    try {
      const existing = entriesRef.current.find(
        (e) => e.event_date === dateStr && e.event_type === 'period'
      );

      if (existing) {
        const ok = await deleteCycleEntry(existing.profile_id, dateStr, 'period');
        if (ok) {
          setEntries((prev) =>
            prev.filter((e) => !(e.event_date === dateStr && e.event_type === 'period'))
          );
        }
        return ok;
      } else {
        const ok = await saveCycleEntry({
          profile_id: profileId,
          event_date: dateStr,
          event_type: 'period',
        });
        if (ok) {
          setEntries((prev) => {
            if (prev.some((e) => e.event_date === dateStr && e.event_type === 'period')) {
              return prev;
            }
            const newEntry: CycleEntry = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              profile_id: profileId,
              event_date: dateStr,
              event_type: 'period',
              created_at: new Date().toISOString(),
            };
            return [...prev, newEntry];
          });
        }
        return ok;
      }
    } finally {
      processingRef.current.delete(dateStr);
    }
  }, [profileId]);

  return { profileId, entries, prediction, loading, error, togglePeriodDay, canMark };
}

// ========== Composant principal ==========

export default function CycleCalendarScreen() {
  const { entries, prediction, loading, error, togglePeriodDay, canMark } = useCycleData();

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 2000);
  }, []);

  const handleToggleDay = useCallback(async (dateStr: string) => {
    const isCurrentlyMarked = entries.some(
      (e) => e.event_date === dateStr && e.event_type === 'period'
    );
    const ok = await togglePeriodDay(dateStr);
    if (!ok) {
      showToast(
        "Impossible d'enregistrer. Vérifiez que la migration SQL a été exécutée dans Supabase.",
        'error'
      );
    } else {
      showToast(isCurrentlyMarked ? 'Jour retiré' : 'Jour marqué ✓', 'success');
    }
  }, [togglePeriodDay, entries, showToast]);

  const goPrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth]);

  const goNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  const goToday = useCallback(() => {
    setCurrentMonth(new Date().getMonth());
    setCurrentYear(new Date().getFullYear());
  }, []);

  // Index de phase par date depuis la prédiction
  const phaseMap = useMemo(() => {
    const map = new Map<string, 'period' | 'fertile' | 'ovulation' | 'normal'>();
    if (!prediction) return map;
    for (const cycle of prediction.future_cycles) {
      for (const day of cycle.days) {
        map.set(day.date, day.phase as any);
      }
    }
    for (const cycle of prediction.past_cycles) {
      for (const d of cycle.period_days_recorded) {
        if (!map.has(d)) map.set(d, 'period');
      }
    }
    return map;
  }, [prediction]);

  // Ensemble des dates marquées comme règles
  const markedPeriods = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.event_type === 'period') set.add(e.event_date);
    }
    return set;
  }, [entries]);

  // Grille du calendrier
  const weeks = useMemo(
    () => generateCalendarGrid(currentYear, currentMonth, phaseMap, markedPeriods),
    [currentYear, currentMonth, phaseMap, markedPeriods]
  );

  // ========== États d'écran ==========

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <HeartFilledIcon size={48} color={colors.accent} />
        <Text style={styles.errorTitle}>Oups…</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* ========== HEADER ========== */}
      <SafeAreaView edges={['top']} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <BackIcon size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Notre Calendrier</Text>
            <Text style={styles.headerSubtitle}>Suivi de cycle partagé</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== CARTE STATUT AUJOURD'HUI ========== */}
        <TodayCard
          prediction={prediction}
          periodDays={markedPeriods}
          onMarkToday={() => handleToggleDay(formatDateStr(new Date()))}
          isLoading={loading}
          canMark={canMark}
        />

        {/* ========== CALENDRIER ========== */}
        {/* Navigation mois */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goPrevMonth} style={styles.navBtn}>
            <ChevronLeftIcon size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToday}>
            <Text style={styles.monthTitle}>
              {MONTHS_FR[currentMonth]} {currentYear}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNextMonth} style={styles.navBtn}>
            <ChevronRightIcon size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Jours de la semaine */}
        <View style={styles.daysHeader}>
          {DAYS_FR.map((d) => (
            <View key={d} style={{ flex: 1 }}>
              <Text style={styles.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Grille */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => (
              <DayCell
                key={`${wi}-${di}`}
                day={day}
                onToggle={() => handleToggleDay(formatDateStr(day.date))}
                canMark={canMark}
              />
            ))}
          </View>
        ))}

        {/* Légende */}
        <View style={styles.legend}>
          {(['period', 'fertile', 'ovulation'] as const).map((key) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PHASE_COLORS[key] }]} />
              <Text style={styles.legendText}>{PHASE_LABELS[key]}</Text>
            </View>
          ))}
        </View>

        {/* Espace pour le toast */}
        <View style={{ height: 70 }} />
      </ScrollView>

      {/* ========== TOAST ========== */}
      {toast && (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            { backgroundColor: toast.type === 'error' ? '#DC2626' : colors.primary },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </View>
  );
}

// ========== Carte statut aujourd'hui ==========

function TodayCard({
  prediction,
  periodDays,
  onMarkToday,
  isLoading,
  canMark,
}: {
  prediction: PredictionResult | null;
  periodDays: Set<string>;
  onMarkToday: () => void;
  isLoading: boolean;
  canMark: boolean;
}) {
  const todayStr = formatDateStr(new Date());
  const isPeriodToday = periodDays.has(todayStr);

  // Source de vérité locale : les jours marqués priment sur `prediction`.
  const localPhase = useMemo(
    () => computeLocalCurrentPhase(periodDays, todayStr),
    [periodDays, todayStr]
  );

  const isInCycle = localPhase?.in_cycle ?? prediction?.current_phase?.in_cycle ?? false;
  const phase = localPhase?.phase ?? prediction?.current_phase?.phase;
  const cycleDay = localPhase?.cycle_day ?? prediction?.current_phase?.cycle_day;
  const nextEvent = prediction?.next_event;
  const reliability = prediction?.stats.reliability;

  if (isLoading || (!prediction && !localPhase)) {
    return (
      <View style={styles.todayCard}>
        <Text style={styles.todayCardPlaceholder}>
          Marquez les règles pour activer les prédictions
        </Text>
      </View>
    );
  }

  const phaseColor =
    phase === 'period' ? PHASE_COLORS.period
      : phase === 'fertile' ? PHASE_COLORS.fertile
        : phase === 'ovulation' ? PHASE_COLORS.ovulation
          : colors.textSecondary;

  return (
    <View style={styles.todayCard}>
      <View style={styles.todayTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.todayLabel}>AUJOURD'HUI</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            {isInCycle && cycleDay != null ? (
              <>
                <Text style={styles.todayInfo}>
                  Jour{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>{cycleDay}</Text>{' '}
                  du cycle
                </Text>
                {phase ? (
                  <Text style={[styles.todayPhaseTag, { color: phaseColor }]}>
                    {'  ·  '}{PHASE_LABELS[phase] || phase}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={[styles.todayInfo, { fontStyle: 'italic' }]}>Hors cycle</Text>
            )}
          </View>
        </View>

        {canMark ? (
          <TouchableOpacity
            onPress={onMarkToday}
            activeOpacity={0.85}
            style={[
              styles.markBtn,
              {
                borderColor: isPeriodToday ? PHASE_COLORS.period : colors.border,
                backgroundColor: isPeriodToday ? `${PHASE_COLORS.period}15` : 'transparent',
              },
            ]}
          >
            {isPeriodToday ? (
              <>
                <CheckIcon size={14} color={PHASE_COLORS.period} />
                <Text style={[styles.markBtnText, { color: PHASE_COLORS.period }]}>Marquée</Text>
              </>
            ) : (
              <>
                <PlusIcon size={14} color={colors.textSecondary} />
                <Text style={styles.markBtnText}>Règles</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.markBtn, { borderColor: colors.border, opacity: 0.7 }]}>
            <Text style={styles.markBtnText}>👁 Suivi</Text>
          </View>
        )}
      </View>

      {/* Prochain événement */}
      {nextEvent && (
        <View style={styles.nextEventBox}>
          <View style={styles.nextEventLeft}>
            <View
              style={[
                styles.nextEventDot,
                { backgroundColor: PHASE_COLORS[nextEvent.phase] || colors.textTertiary },
              ]}
            />
            <Text style={styles.nextEventLabel}>
              {nextEvent.phase === 'period' ? 'Prochaines règles'
                : nextEvent.phase === 'ovulation' ? 'Ovulation'
                  : nextEvent.phase === 'fertile' ? 'Fenêtre fertile'
                    : nextEvent.phase}
            </Text>
          </View>
          <Text style={styles.nextEventCountdown}>
            {nextEvent.days_remaining === 0
              ? "Aujourd'hui"
              : `Dans ${nextEvent.days_remaining} jour${nextEvent.days_remaining > 1 ? 's' : ''}`}
          </Text>
        </View>
      )}

      {/* Fiabilité */}
      {reliability && (
        <View style={styles.reliabilityRow}>
          <View style={styles.reliabilityTrack}>
            <View
              style={{
                width: `${reliability.score}%`,
                height: '100%',
                borderRadius: 1.5,
                backgroundColor: colors.accent,
              }}
            />
          </View>
          <Text style={styles.reliabilityText}>
            Fiabilité {reliability.level} ({reliability.score}%)
          </Text>
        </View>
      )}
    </View>
  );
}

// ========== Cellule du calendrier ==========

function DayCell({ day, onToggle, canMark }: { day: CalendarDay; onToggle: () => void; canMark: boolean }) {
  const phase = day.phase;
  const hasPhase = phase !== 'normal';
  const isPeriodMarked = day.isPeriodMarked;

  const bgColor = isPeriodMarked
    ? `${PHASE_COLORS.period}15`
    : hasPhase && day.isCurrentMonth
      ? `${PHASE_COLORS[phase]}10`
      : 'transparent';

  const borderColor = day.isToday ? colors.accent : 'transparent';

  const content = (
    <>
      <Text
        style={[
          styles.dayNumber,
          day.isToday && { fontSize: 15, fontWeight: '700', color: colors.primary },
        ]}
      >
        {day.day}
      </Text>

      {(hasPhase && day.isCurrentMonth && !isPeriodMarked) && (
        <View style={[styles.phaseDot, { backgroundColor: PHASE_COLORS[phase] }]} />
      )}

      {isPeriodMarked && (
        <View style={[styles.phaseDot, { backgroundColor: PHASE_COLORS.period }]} />
      )}
    </>
  );

  const cellStyle = [
    styles.dayCell,
    { backgroundColor: bgColor, borderColor },
    !day.isCurrentMonth && { opacity: 0.3 },
  ];

  if (!canMark) {
    // Mode lecture seule — l'homme voit mais ne marque pas
    return <View style={cellStyle}>{content}</View>;
  }

  return (
    <TouchableOpacity style={cellStyle} onPress={onToggle} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

// ========== Styles ==========

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },

  // Header
  headerWrap: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '400',
    color: '#FAFAF9',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // Erreur
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
  },
  errorSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Today card
  todayCard: {
    marginHorizontal: 0,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 2,
  },
  todayCardPlaceholder: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  todayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  todayInfo: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  todayPhaseTag: {
    fontSize: 13,
    fontWeight: '600',
  },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    borderWidth: 1.5,
  },
  markBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  nextEventBox: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.primary}08`,
    borderRadius: borderRadius.md,
  },
  nextEventLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextEventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nextEventLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  nextEventCountdown: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  reliabilityRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reliabilityTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  reliabilityText: {
    fontSize: 10,
    color: colors.textTertiary,
  },

  // Navigation mois
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  navBtn: {
    padding: spacing.sm,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },

  // Jours
  daysHeader: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: spacing.xs,
  },
  dayHeaderText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 4,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    marginVertical: 1,
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 16,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Légende
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    maxWidth: 400,
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FAFAF9',
    textAlign: 'center',
  },
});
