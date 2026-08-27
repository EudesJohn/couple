// ============================================================
// 📞 Journal des appels — historique audio/vidéo
// Portage mobile de notre-bulle-web/src/pages/CallHistory.tsx
// - Groupé par jour (Aujourd'hui / Hier / date)
// - Statut codé couleur (manqué = rouge)
// - Tap = rappeler le partenaire (même type d'appel)
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, borderRadius } from '../../src/constants/theme';
import { supabase } from '../../src/lib/supabase';
import { getOwnProfileId } from '../../src/lib/profile';
import { useCall } from '../../src/hooks/useCall';
import {
  PhoneIcon, VideoIcon, HistoryIcon, MissedCallIcon, ChevronRightIcon, BackIcon,
} from '../../src/components/Icons';
import type { Call, CallType } from '../../src/types/database';

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
  const status = statusLabel(call, isOutgoing);
  const isMissed = call.status === 'missed';

  return (
    <TouchableOpacity
      onPress={() => onCallBack(call.type)}
      activeOpacity={0.7}
      style={styles.callRow}
    >
      {/* Icône type d'appel */}
      <View
        style={[
          styles.callIconCircle,
          { backgroundColor: isMissed ? `${colors.error}14` : colors.surfaceAlt2 },
        ]}
      >
        {isVideo
          ? <VideoIcon size={20} color={isMissed ? colors.error : colors.accent} />
          : <PhoneIcon size={20} color={isMissed ? colors.error : colors.primary} />}
      </View>

      {/* Infos */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.callTitleRow}>
          <Text style={styles.callTitle} numberOfLines={1}>
            {isOutgoing ? 'Appel sortant' : 'Appel entrant'}
          </Text>
          {isMissed && <MissedCallIcon size={14} color={colors.error} />}
        </View>
        <View style={styles.callStatusRow}>
          <Text style={[styles.callStatusType, { color: isVideo ? colors.accent : colors.primary }]}>
            {isVideo ? 'Vidéo' : 'Audio'}
          </Text>
          <Text style={styles.callStatusDot}>·</Text>
          <Text style={[styles.callStatusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>

      {/* Heure + chevron */}
      <View style={styles.callRight}>
        <Text style={styles.callTime}>{formatTime(call.created_at)}</Text>
        <ChevronRightIcon size={16} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

// ==========================================
// ÉTAT VIDE / ERREUR
// ==========================================
function EmptyState({ title, subtitle, actionLabel, onAction }: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centerState}>
      <HistoryIcon size={40} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ==========================================
// ÉCRAN PRINCIPAL
// ==========================================
export default function CallHistoryScreen() {
  const { startCall } = useCall();
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myProfileId, setMyProfileId] = useState<string>('');

  useEffect(() => {
    getOwnProfileId().then((id) => setMyProfileId(id || ''));
  }, []);

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
      console.warn("Erreur chargement journal d'appels:", err?.message);
      setError(err?.message || 'Impossible de charger le journal');
      setCalls([]);
    }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  // Groupement par jour (du plus récent au plus ancien)
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
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <BackIcon size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.headerTitle}>Journal des appels</Text>
            {calls && calls.length > 0 && (
              <Text style={styles.headerSubtitle}>
                {calls.length} appel{calls.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <View style={{ width: 38 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.huge }}>
        {calls === null ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Chargement du journal…</Text>
          </View>
        ) : error ? (
          <EmptyState
            title="Impossible de charger"
            subtitle={error}
            actionLabel="Réessayer"
            onAction={loadCalls}
          />
        ) : calls.length === 0 ? (
          <EmptyState
            title="Aucun appel pour l'instant"
            subtitle="Quand vous vous appellerez, l'historique apparaîtra ici."
            actionLabel="Appeler mon partenaire"
            onAction={() => startCall('audio')}
          />
        ) : (
          groups.map((group) => (
            <View key={group.label}>
              {/* Séparateur de jour */}
              <View style={styles.daySeparator}>
                <View style={styles.daySeparatorLine} />
                <Text style={styles.daySeparatorText}>{group.label}</Text>
                <View style={styles.daySeparatorLine} />
              </View>

              {/* Carte du jour */}
              <View style={styles.dayCard}>
                {group.calls.map((call, i) => (
                  <View key={call.id}>
                    {i > 0 && <View style={styles.rowDivider} />}
                    <CallRow
                      call={call}
                      isOutgoing={call.caller_id === myProfileId}
                      onCallBack={handleCallBack}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  headerWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
  },

  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyAction: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FAFAF9',
  },

  daySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  daySeparatorText: {
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'capitalize',
    fontWeight: '500',
  },

  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 76,
  },

  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  callIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  callTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  callTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  callStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  callStatusType: {
    fontSize: 13,
    fontWeight: '500',
  },
  callStatusDot: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  callStatusText: {
    fontSize: 13,
  },
  callRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  callTime: {
    fontSize: 13,
    color: colors.textTertiary,
  },
});
