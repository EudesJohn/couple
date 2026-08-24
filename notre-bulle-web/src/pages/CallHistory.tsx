// ============================================================
// Journal des appels — historique audio/vidéo
// Design Burgundy & Gold, Framer Motion
// - Groupé par jour (Aujourd'hui / Hier / date)
// - Statut codé couleur (manqué = rouge)
// - Tap = rappeler le partenaire (même type d'appel)
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { getOwnProfileId } from '../lib/profile';
import { useCall } from '../hooks/useCall';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/ui/EmptyState';
import {
  PhoneIcon, VideoIcon, HistoryIcon, MissedCallIcon, ChevronRightIcon,
} from '../components/Icons';
import type { Call, CallType } from '../types/database';

// ==========================================
// FORMATAGE
// ==========================================
function formatDuration(durationS: number | null): string {
  if (durationS == null || durationS <= 0) return '';
  const h = Math.floor(durationS / 3600);
  const m = Math.floor((durationS % 3600) / 60);
  const s = durationS % 60;
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${s.toString().padStart(2, '0')} s`;
  return `${s} s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000);

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function statusLabel(call: Call, isOutgoing: boolean): { text: string; color: string } {
  switch (call.status) {
    case 'missed':
      return { text: isOutgoing ? 'Sans réponse' : 'Manqué', color: colors.error };
    case 'answered':
      return { text: formatDuration(call.duration_s) || 'Répondu', color: colors.textSecondary };
    case 'cancelled':
      return { text: 'Annulé', color: colors.textTertiary };
    case 'failed':
      return { text: 'Échoué', color: colors.textTertiary };
    default:
      return { text: '', color: colors.textSecondary };
  }
}

// ==========================================
// LIGNE D'APPEL
// ==========================================
function CallRow({ call, isOutgoing, onCallBack }: {
  call: Call;
  isOutgoing: boolean;
  onCallBack: (type: CallType) => void;
}) {
  const isVideo = call.type === 'video';
  const Icon = isVideo ? VideoIcon : PhoneIcon;
  const status = statusLabel(call, isOutgoing);
  const isMissed = call.status === 'missed';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      onClick={() => onCallBack(call.type)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        width: '100%',
        padding: `${spacing.md}px ${spacing.lg}px`,
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.surfaceAlt; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      {/* Icône type d'appel */}
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isMissed ? colors.error + '14' : colors.surfaceAlt2,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={isMissed ? colors.error : (isVideo ? colors.accent : colors.primary)} />
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: colors.text,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isOutgoing ? 'Appel sortant' : 'Appel entrant'}
          </span>
          {isMissed && (
            <MissedCallIcon size={14} color={colors.error} />
          )}
        </div>
        <div style={{
          fontSize: 13,
          color: status.color,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
        }}>
          <span>{isVideo ? 'Vidéo' : 'Audio'}</span>
          <span style={{ color: colors.textTertiary }}>·</span>
          <span>{status.text}</span>
        </div>
      </div>

      {/* Heure + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
        <span style={{ fontSize: 13, color: colors.textTertiary }}>
          {formatTime(call.created_at)}
        </span>
        <ChevronRightIcon size={16} color={colors.textTertiary} />
      </div>
    </motion.button>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function CallHistoryScreen() {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myProfileId = getOwnProfileId();

  const loadCalls = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;
      setCalls((data as Call[]) ?? []);
    } catch (err: any) {
      console.warn('Erreur chargement journal d\'appels:', err?.message);
      setError(err?.message || 'Impossible de charger le journal');
      setCalls([]);
    }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  // Groupement par jour (ordre chronologique du plus récent au plus ancien)
  const groups = useMemo(() => {
    if (!calls) return [];
    const map = new Map<string, Call[]>();
    for (const call of calls) {
      const key = call.created_at.slice(0, 10); // yyyy-mm-dd
      const arr = map.get(key);
      if (arr) arr.push(call);
      else map.set(key, [call]);
    }
    return Array.from(map.entries()).map(([day, dayCalls]) => ({
      label: dayLabel(day + 'T12:00:00'),
      calls: dayCalls,
    }));
  }, [calls]);

  const handleCallBack = useCallback((type: CallType) => {
    startCall(type);
  }, [startCall]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: colors.background,
    }}>
      <ScreenHeader
        title="Journal des appels"
        subtitle={calls && calls.length > 0 ? `${calls.length} appel${calls.length > 1 ? 's' : ''}` : undefined}
        onBack={() => navigate('/chat')}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {calls === null ? (
          // Loading
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: spacing.huge, gap: spacing.md,
          }}>
            <div style={{
              width: 22, height: 22,
              border: `2px solid ${colors.border}`,
              borderTopColor: colors.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: 14, color: colors.textTertiary }}>
              Chargement du journal…
            </span>
          </div>
        ) : error ? (
          <EmptyState
            icon={HistoryIcon}
            title="Impossible de charger"
            subtitle={error}
            actionLabel="Réessayer"
            onAction={loadCalls}
          />
        ) : calls.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Aucun appel pour l'instant"
            subtitle="Quand vous vous appellerez, l'historique apparaîtra ici."
            actionLabel="Appeler mon partenaire"
            onAction={() => startCall('audio')}
          />
        ) : (
          <AnimatePresence>
            {groups.map((group, gi) => (
              <motion.div
                key={group.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: gi * 0.05 }}
              >
                {/* Séparateur de jour */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: `${spacing.md}px ${spacing.xl}px ${spacing.sm}px`,
                  gap: spacing.md,
                }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
                  <span style={{
                    fontSize: 12,
                    color: colors.textTertiary,
                    textTransform: 'capitalize',
                    fontWeight: 500,
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: 1, backgroundColor: colors.borderLight }} />
                </div>

                {/* Carte du jour */}
                <div style={{
                  backgroundColor: colors.surface,
                  borderRadius: borderRadius.xl,
                  margin: `0 ${spacing.lg}px ${spacing.lg}px`,
                  boxShadow: `0 2px 10px ${colors.shadow}`,
                  overflow: 'hidden',
                }}>
                  {group.calls.map((call, i) => (
                    <div key={call.id}>
                      {i > 0 && <div style={{ height: 1, backgroundColor: colors.borderLight, marginLeft: 76 }} />}
                      <CallRow
                        call={call}
                        isOutgoing={call.caller_id === myProfileId}
                        onCallBack={handleCallBack}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
