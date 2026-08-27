// ============================================================
// Layout du Chat — header premium avec pseudo + photo partenaire
// Copie fidèle de notre-bulle-web/src/pages/ChatLayout.tsx
// ============================================================
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../../src/constants/theme';
import { usePresence } from '../../src/hooks/usePresence';
import { useCall } from '../../src/hooks/useCall';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { getActualPartnerProfileId } from '../../src/lib/profile';
import { getSignedMediaUrl } from '../../src/lib/media';
import { PhoneIcon, SettingsIcon, HeartFilledIcon, ImageIcon, HistoryIcon, CycleIcon } from '../../src/components/Icons';
import { CallTypeSheet } from '../../src/components/call/CallTypeSheet';
import { MoreMenu } from '../../src/components/ui/MoreMenu';

function formatTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'A l instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

function ChatHeader() {
  const insets = useSafeAreaInsets();
  const { isPartnerOnline, partnerPresence } = usePresence();
  const { startCall } = useCall();
  const { identity } = useAuth();
  const isTyping = partnerPresence?.is_typing ?? false;
  const [callSheetVisible, setCallSheetVisible] = useState(false);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(null);
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const FALLBACK_NAME = identity === 'woman' ? 'Mon chéri' : 'Ma chérie';

  // Charger pseudo + photo du partenaire depuis profiles (comme le web)
  useEffect(() => {
    mountedRef.current = true;
    async function loadPartnerProfile() {
      const partnerId = await getActualPartnerProfileId();
      if (!partnerId || !mountedRef.current) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', partnerId)
        .single();

      if (!mountedRef.current) return;
      if (error) return;

      if (data?.display_name) setPartnerDisplayName(data.display_name);
      if (data?.avatar_url) {
        // Construire l'URL du media depuis Supabase Storage
        try {
          const url = await getSignedMediaUrl(data.avatar_url);
          setPartnerAvatarUrl(url);
        } catch {}
      }
    }
    loadPartnerProfile();
    return () => { mountedRef.current = false; };
  }, [identity]);

  const partnerName = partnerDisplayName || FALLBACK_NAME;
  const partnerLastSeen = !isPartnerOnline && partnerPresence?.last_seen_at
    ? formatTimeSince(partnerPresence.last_seen_at)
    : 'Hors ligne';

  const handleCallPress = () => setCallSheetVisible(true);

  return (
    <>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: (insets?.top ?? 0) + 8,
        paddingBottom: 12,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}>
        {/* Partenaire */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.surfaceDim,
            justifyContent: 'center', alignItems: 'center',
            overflow: 'hidden', position: 'relative',
          }}>
            {partnerAvatarUrl ? (
              <Image source={{ uri: partnerAvatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
            ) : (
              <HeartFilledIcon size={18} color={colors.accent} />
            )}
            {/* Indicateur en ligne */}
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: isPartnerOnline ? colors.online : colors.textTertiary,
              borderWidth: 2.5, borderColor: colors.surface,
            }} />
          </View>

          {/* Infos */}
          <View>
            <Text style={{
              fontSize: 17, fontWeight: '600', color: colors.text,
              letterSpacing: -0.3,
            }}>
              {partnerName}
            </Text>
            <Text style={{
              fontSize: 12, fontWeight: '500',
              color: isPartnerOnline ? colors.online : colors.textTertiary,
            }}>
              {isTyping ? 'Écrit...' : isPartnerOnline ? 'En ligne' : partnerLastSeen}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <MoreMenu
            items={[
              { label: 'Nos souvenirs', icon: ImageIcon, color: colors.secondary, onPress: () => router.push('/gallery') },
              { label: 'Journal des appels', icon: HistoryIcon, color: colors.textSecondary, onPress: () => router.push('/calls') },
              { label: 'Cycle', icon: CycleIcon, color: colors.secondary, onPress: () => router.push('/cycle') },
              { label: 'Paramètres', icon: SettingsIcon, color: colors.textSecondary, onPress: () => router.push('/settings') },
            ]}
          />

          <TouchableOpacity
            onPress={handleCallPress}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.primary,
              justifyContent: 'center', alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <PhoneIcon size={16} color="#FAFAF9" />
          </TouchableOpacity>
        </View>
      </View>

      <CallTypeSheet
        visible={callSheetVisible}
        onClose={() => setCallSheetVisible(false)}
        onStartAudioCall={() => startCall('audio')}
        onStartVideoCall={() => startCall('video')}
      />
    </>
  );
}

export default function ChatLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ header: () => <ChatHeader /> }}
      />
    </Stack>
  );
}
