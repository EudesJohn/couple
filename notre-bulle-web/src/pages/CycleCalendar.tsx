// ============================================================
// 📅 Cycle Tracker — Calendrier menstruel partagé
// Design premium Burgundy & Gold, animations Framer Motion
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius, fonts } from '../constants/theme';
import {
  HeartFilledIcon, BackIcon,
  ChevronLeftIcon, ChevronRightIcon,
  PlusIcon, CheckIcon,
} from '../components/Icons';
import { getMyProfileId, getPartnerProfileId } from '../lib/profile';
import {
  getCycleEntriesByProfileIds,
  saveCycleEntry,
  deleteCycleEntry,
  fetchPredictions,
  generateCalendarGrid,
  formatDateStr,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../lib/cycleApi';
import type {
  CycleEntry,
  PredictionResult,
  CalendarDay,
} from '../lib/cycleApi';

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
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Réf pour éviter les closures obsolètes (race condition clic rapide → 409)
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const processingRef = useRef<Set<string>>(new Set());

  // Charger le profil
  useEffect(() => {
    const id = getMyProfileId();
    setProfileId(id);
    if (!id) {
      setError('Profil non trouvé — verrouillez d\'abord l\'application.');
      setLoading(false);
    }
  }, []);

  // Charger les entrées et le partenaire
  useEffect(() => {
    if (!profileId) return;

    const load = async () => {
      try {
        // Charger les entrées des DEUX profils (calendrier partagé)
        // On utilise les IDs directement depuis la config au lieu de
        // conversation_members pour éviter les problèmes de RLS.
        const myId = getMyProfileId();
        const partnerId = getPartnerProfileId();
        const allProfileIds = [myId, partnerId].filter(Boolean) as string[];

        const allEntries = await getCycleEntriesByProfileIds(allProfileIds);

        setEntries(allEntries);
      } catch (err: any) {
        console.warn('Erreur chargement données cycle:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profileId]);

  // Prédiction
  useEffect(() => {
    if (entries.length === 0 || !profileId) return;
    setPredicting(true);
    fetchPredictions(entries)
      .then(setPrediction)
      .catch(() => {})
      .finally(() => setPredicting(false));
  }, [entries, profileId]);

  const togglePeriodDay = useCallback(async (dateStr: string) => {
    if (!profileId) return false;

    // Verrouillage anti-doublon : ignorer si déjà en cours
    if (processingRef.current.has(dateStr)) return true;
    processingRef.current.add(dateStr);

    try {
      // Utiliser le ref pour avoir la donnée la plus récente (pas la closure)
      const existing = entriesRef.current.find(
        (e) => e.event_date === dateStr && e.event_type === 'period'
      );

      if (existing) {
        const ok = await deleteCycleEntry(profileId, dateStr, 'period');
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
            // Vérifier dans le state le plus récent (évite doublons entre ref et setEntries)
            if (prev.some((e) => e.event_date === dateStr && e.event_type === 'period')) {
              return prev;
            }
            const newEntry: CycleEntry = {
              id: crypto.randomUUID(),
              profile_id: profileId!,
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
  }, [profileId]); // plus de dépendance entries → plus de closure obsolète

  // Seule celle qui a des entrées "period" peut marquer (ou tout le monde si première utilisation)
  const canMark = useMemo(() => {
    if (!profileId) return false;
    const trackers = new Set(
      entries.filter((e) => e.event_type === 'period').map((e) => e.profile_id)
    );
    if (trackers.size === 0) return true; // premier marquage possible
    return trackers.has(profileId);
  }, [entries, profileId]);

  return {
    profileId,
    entries,
    prediction,
    loading,
    predicting,
    error,
    togglePeriodDay,
    canMark,
  };
}

// ========== Composant principal ==========

export default function CycleCalendar() {
  const {
    profileId,
    entries,
    prediction,
    loading,
    predicting,
    error,
    togglePeriodDay,
    canMark,
  } = useCycleData();

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [animDir, setAnimDir] = useState<'left' | 'right'>('left');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null);

  // Wrapper avec feedback utilisateur
  const handleToggleDay = useCallback(async (dateStr: string) => {
    const isCurrentlyMarked = entries.some(
      (e) => e.event_date === dateStr && e.event_type === 'period'
    );
    const ok = await togglePeriodDay(dateStr);
    if (!ok) {
      setToast({
        message: 'Impossible d\'enregistrer. Vérifiez que la migration SQL a été exécutée dans Supabase.',
        type: 'error',
      });
      setTimeout(() => setToast(null), 5000);
    } else {
      setToast({
        message: isCurrentlyMarked ? 'Jour retiré' : 'Jour marqué ✓',
        type: 'success',
      });
      setTimeout(() => setToast(null), 2000);
    }
  }, [togglePeriodDay, entries]);

  const goPrevMonth = useCallback(() => {
    setAnimDir('right');
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth]);

  const goNextMonth = useCallback(() => {
    setAnimDir('left');
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  const goToday = useCallback(() => {
    setAnimDir('left');
    setCurrentMonth(new Date().getMonth());
    setCurrentYear(new Date().getFullYear());
  }, []);

  // Index de phase par date depuis la prédiction
  const phaseMap = useMemo(() => {
    const map = new Map<string, 'period' | 'fertile' | 'ovulation' | 'normal'>();
    if (!prediction) return map;

    for (const cycle of prediction.future_cycles) {
      if (cycle.days) {
        for (const day of cycle.days) {
          map.set(day.date, day.phase as any);
        }
      }
    }
    // Ajouter aussi les jours passés si disponibles
    for (const cycle of prediction.past_cycles) {
      if (cycle.period_days_recorded) {
        for (const d of cycle.period_days_recorded) {
          if (!map.has(d)) map.set(d, 'period');
        }
      }
    }
    return map;
  }, [prediction]);

  // Ensemble des dates marquées comme règles
  const markedPeriods = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.event_type === 'period') {
        set.add(e.event_date);
      }
    }
    return set;
  }, [entries]);

  // Grille du calendrier
  const weeks = useMemo(
    () => generateCalendarGrid(currentYear, currentMonth, phaseMap, markedPeriods),
    [currentYear, currentMonth, phaseMap, markedPeriods]
  );

  // Aucun nom affiché — calendrier partagé

  // ========== États d'écran ==========

  if (error) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.background, padding: '0 40px',
        minHeight: '100%',
      }}>
        <HeartFilledIcon size={48} color={colors.accent} />
        <h3 style={{ fontSize: 18, fontWeight: 600, color: colors.text, marginTop: spacing.lg }}>
          Oups…
        </h3>
        <p style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }}>
          {error}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.background, minHeight: '100%',
      }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          style={{ width: 32, height: 32, border: `3px solid ${colors.border}`, borderTopColor: colors.primary, borderRadius: '50%' }}
        />
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: colors.background,
      minHeight: '100%',
      position: 'relative',
    }}>
      {/* ========== HEADER ========== */}
      <div style={{
        padding: `${spacing.xl}px ${spacing.lg}px ${spacing.sm}px`,
        paddingTop: `calc(${spacing.xl}px + env(safe-area-inset-top, 0px))`,
        backgroundColor: colors.primary,
        borderBottomLeftRadius: borderRadius.xl,
        borderBottomRightRadius: borderRadius.xl,
        position: 'relative',
      }}>
        {/* Bouton retour */}
        <button
          onClick={() => window.history.back()}
          style={{
            position: 'absolute', top: `calc(${spacing.lg}px + env(safe-area-inset-top, 0px))`, left: spacing.md,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: spacing.sm, color: 'rgba(255,255,255,0.8)',
            fontFamily: 'inherit',
          }}
        >
          <BackIcon size={22} color="rgba(255,255,255,0.8)" />
        </button>

        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: fonts.display,
            fontSize: 24,
            fontWeight: 400,
            color: '#FAFAF9',
            marginBottom: 2,
          }}>
            Notre Calendrier
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            Suivi de cycle partagé
          </p>
        </div>
      </div>

      {/* ========== CARTE STATUT AUJOURD'HUI ========== */}
      <TodayCard
        prediction={prediction}
        predicting={predicting}
        periodDays={markedPeriods}
        onMarkToday={() => {
          const today = formatDateStr(new Date());
          handleToggleDay(today);
        }}
        isLoading={loading}
        canMark={canMark}
      />

      {/* ========== CALENDRIER ========== */}
      <div style={{
        flex: 1,
        padding: `${spacing.md}px ${spacing.lg}px`,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Navigation mois */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: spacing.md,
        }}>
          <button onClick={goPrevMonth} style={navBtnStyle}>
            <ChevronLeftIcon size={20} color={colors.primary} />
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={goToday}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <h2 style={{
              fontSize: 20, fontWeight: 700, color: colors.text,
              fontFamily: fonts.ui, letterSpacing: -0.3,
            }}>
              {MONTHS_FR[currentMonth]} {currentYear}
            </h2>
          </motion.button>
          <button onClick={goNextMonth} style={navBtnStyle}>
            <ChevronRightIcon size={20} color={colors.primary} />
          </button>
        </div>

        {/* Jours de la semaine */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2, marginBottom: spacing.xs,
        }}>
          {DAYS_FR.map((d) => (
            <div key={d} style={{
              textAlign: 'center', fontSize: 11, fontWeight: 600,
              color: colors.textTertiary, textTransform: 'uppercase',
              letterSpacing: 0.5, padding: '4px 0',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grille */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentYear}-${currentMonth}`}
            initial={{ opacity: 0, x: animDir === 'left' ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: animDir === 'left' ? -30 : 30 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {weeks.map((week, wi) => (
              <div key={wi} style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 2,
              }}>
                {week.map((day, di) => (
                  <DayCell
                    key={`${wi}-${di}`}
                    day={day}
                    onToggle={() => handleToggleDay(formatDateStr(day.date))}
                    canMark={canMark}
                  />
                ))}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Légende */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 16,
          marginTop: spacing.xl, marginBottom: spacing.xxl,
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Règles', color: PHASE_COLORS.period },
            { label: 'Fertile', color: PHASE_COLORS.fertile },
            { label: 'Ovulation', color: PHASE_COLORS.ovulation },
          ].map((item) => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: item.color,
              }} />
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Espace pour le bouton flottant */}
        <div style={{ height: 80 }} />
      </div>

      {/* ========== TOAST ========== */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              bottom: `calc(24px + env(safe-area-inset-bottom, 0px))`,
              left: 24,
              right: 24,
              maxWidth: 400,
              margin: '0 auto',
              padding: `${spacing.md}px ${spacing.lg}px`,
              backgroundColor: toast.type === 'error' ? '#DC2626' : colors.primary,
              borderRadius: borderRadius.lg,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              zIndex: 100,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: '#FAFAF9' }}>
              {toast.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ========== Carte statut aujourd'hui ==========

function TodayCard({
  prediction,
  predicting,
  periodDays,
  onMarkToday,
  isLoading,
  canMark,
}: {
  prediction: PredictionResult | null;
  predicting: boolean;
  periodDays: Set<string>;
  onMarkToday: () => void;
  isLoading: boolean;
  canMark: boolean;
}) {
  const todayStr = formatDateStr(new Date());
  const isPeriodToday = periodDays.has(todayStr);
  const isInCycle = prediction?.current_phase?.in_cycle ?? false;
  const phase = prediction?.current_phase?.phase;
  const cycleDay = prediction?.current_phase?.cycle_day;
  const nextEvent = prediction?.next_event;
  const reliability = prediction?.stats.reliability;

  if (isLoading || !prediction) {
    return (
      <div style={{
        margin: `${spacing.md}px ${spacing.lg}px`,
        padding: spacing.lg,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        boxShadow: `0 2px 8px ${colors.shadow}`,
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 14, color: colors.textTertiary, fontStyle: 'italic' }}>
          {predicting ? 'Analyse des cycles…' : 'Marquez les règles pour activer les prédictions'}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      style={{
        margin: `${spacing.md}px ${spacing.lg}px`,
        padding: spacing.lg,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        boxShadow: `0 2px 8px ${colors.shadow}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <div>
          <span style={{ fontSize: 12, color: colors.textTertiary, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Aujourd'hui
          </span>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
            {isInCycle && cycleDay ? (
              <span>
                Jour <strong style={{ color: colors.text }}>{cycleDay}</strong> du cycle
                {phase && (
                  <span style={{
                    marginLeft: 8,
                    color: phase === 'period' ? PHASE_COLORS.period
                      : phase === 'fertile' ? PHASE_COLORS.fertile
                      : phase === 'ovulation' ? PHASE_COLORS.ovulation
                      : colors.textSecondary,
                  }}>
                    &middot; {PHASE_LABELS[phase] || phase}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ fontStyle: 'italic' }}>Hors cycle</span>
            )}
          </div>
        </div>

        {canMark ? (
          /* Bouton marquer règles — pour elle */
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={onMarkToday}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: borderRadius.pill,
              border: `1.5px solid ${isPeriodToday ? PHASE_COLORS.period : colors.border}`,
              backgroundColor: isPeriodToday ? `${PHASE_COLORS.period}15` : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {isPeriodToday ? (
              <>
                <CheckIcon size={14} color={PHASE_COLORS.period} />
                <span style={{ fontSize: 13, color: PHASE_COLORS.period, fontWeight: 600 }}>
                  Marquée
                </span>
              </>
            ) : (
              <>
                <PlusIcon size={14} color={colors.textSecondary} />
                <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>
                  Règles
                </span>
              </>
            )}
          </motion.button>
        ) : (
          /* Indicateur lecture seule — pour lui */
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: borderRadius.pill,
            border: `1.5px solid ${colors.border}`,
            backgroundColor: 'transparent',
            opacity: 0.7,
          }}>
            <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>
              👁 Suivi
            </span>
          </div>
        )}
      </div>

      {/* Prochain événement */}
      {nextEvent && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: `${colors.primary}08`,
          borderRadius: borderRadius.md,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: PHASE_COLORS[nextEvent.phase] || colors.textTertiary,
            }} />
            <span style={{ fontSize: 13, color: colors.textSecondary }}>
              {nextEvent.phase === 'period' ? 'Prochaines règles'
                : nextEvent.phase === 'ovulation' ? 'Ovulation'
                : nextEvent.phase === 'fertile' ? 'Fenêtre fertile'
                : nextEvent.phase}
            </span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.primary }}>
            {nextEvent.days_remaining === 0
              ? "Aujourd'hui"
              : `Dans ${nextEvent.days_remaining} jour${nextEvent.days_remaining > 1 ? 's' : ''}`}
          </span>
        </div>
      )}

      {/* Fiabilité */}
      {reliability && (
        <div style={{
          marginTop: spacing.sm,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            flex: 1, height: 3,
            backgroundColor: colors.border, borderRadius: 1.5,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${reliability.score}%`, height: '100%',
              background: `linear-gradient(90deg, ${colors.accent}, ${colors.primary})`,
              borderRadius: 1.5,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: colors.textTertiary, whiteSpace: 'nowrap' }}>
            Fiabilité {reliability.level} ({reliability.score}%)
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ========== Cellule du calendrier ==========

function DayCell({
  day,
  onToggle,
  canMark,
}: {
  day: CalendarDay;
  onToggle: () => void;
  canMark: boolean;
}) {
  const [tapping, setTapping] = useState(false);

  const phase = day.phase;
  const hasPhase = phase !== 'normal';
  const isPeriodMarked = day.isPeriodMarked;

  const bgColor = isPeriodMarked
    ? `${PHASE_COLORS.period}15`
    : hasPhase && day.isCurrentMonth
      ? `${PHASE_COLORS[phase]}10`
      : 'transparent';

  const borderColor = day.isToday ? colors.accent : 'transparent';

  if (!canMark) {
    // Mode lecture seule — l'homme voit le calendrier mais ne peut pas marquer
    return (
      <motion.div
        style={{
          aspectRatio: '1',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 2,
          borderRadius: borderRadius.md,
          backgroundColor: bgColor,
          border: `1.5px solid ${borderColor}`,
          opacity: day.isCurrentMonth ? 1 : 0.3,
          position: 'relative',
          width: '100%',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: day.isToday ? 15 : 13,
          fontWeight: day.isToday ? 700 : 500,
          color: day.isToday ? colors.primary : colors.text,
          lineHeight: 1,
        }}>
          {day.day}
        </span>

        {hasPhase && day.isCurrentMonth && !isPeriodMarked && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            backgroundColor: PHASE_COLORS[phase],
          }} />
        )}

        {isPeriodMarked && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            backgroundColor: PHASE_COLORS.period,
            boxShadow: `0 0 4px ${PHASE_COLORS.period}66`,
          }} />
        )}
      </motion.div>
    );
  }

  // Mode interactif — la femme peut marquer ses règles
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={() => {
        setTapping(true);
        setTimeout(() => setTapping(false), 150);
        onToggle();
      }}
      style={{
        aspectRatio: '1',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
        borderRadius: borderRadius.md,
        backgroundColor: bgColor,
        border: `1.5px solid ${borderColor}`,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background-color 0.15s',
        opacity: day.isCurrentMonth ? 1 : 0.3,
        position: 'relative',
        width: '100%',
      }}
    >
      <span style={{
        fontSize: day.isToday ? 15 : 13,
        fontWeight: day.isToday ? 700 : 500,
        color: day.isToday ? colors.primary : colors.text,
        lineHeight: 1,
      }}>
        {day.day}
      </span>

      {/* Indicateur de phase */}
      {hasPhase && day.isCurrentMonth && !isPeriodMarked && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: PHASE_COLORS[phase],
        }} />
      )}

      {/* Point rouge pour les règles marquées */}
      {isPeriodMarked && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: PHASE_COLORS.period,
          boxShadow: `0 0 4px ${PHASE_COLORS.period}66`,
        }} />
      )}

      {/* Ripple d'interaction */}
      <AnimatePresence>
        {tapping && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', width: '100%', height: '100%',
              borderRadius: borderRadius.md,
              backgroundColor: PHASE_COLORS.period,
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ========== Styles ==========

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: spacing.sm, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: colors.primary,
};
