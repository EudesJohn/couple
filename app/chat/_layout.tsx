// ============================================================
// Layout du Chat — header premium avec présence + appels
// Design Burgundy & Gold, animations fluides
// ============================================================
import { View, Text, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { colors, typography, spacing, borderRadius } from '../../src/constants/theme';
import { usePresence } from '../../src/hooks/usePresence';
import { useCall } from '../../src/hooks/useCall';
import { PhoneIcon, VideoIcon, SettingsIcon, HeartFilledIcon } from '../../src/components/Icons';
import { CallTypeSheet } from '../../src/components/call/CallTypeSheet';

const PARTNER_NAME = 'Ma chérie';

function ChatHeader() {
  const { isPartnerOnline, partnerPresence } = usePresence();
  const { startCall } = useCall();
  const isTyping = partnerPresence?.is_typing ?? false;
  const [callSheetVisible, setCallSheetVisible] = useState(false);

  const handleCallPress = () => {
    setCallSheetVisible(true);
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        }}
      >
        {/* Partenaire */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surfaceDim,
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <HeartFilledIcon size={18} color={colors.accent} />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: isPartnerOnline ? colors.online : colors.textTertiary,
                borderWidth: 2.5,
                borderColor: colors.surface,
              }}
            />
          </View>

          {/* Infos */}
          <View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: colors.text,
                letterSpacing: -0.3,
              }}
            >
              {PARTNER_NAME}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: isPartnerOnline ? colors.online : colors.textTertiary,
              }}
            >
              {isTyping ? 'Écrit...' : isPartnerOnline ? 'En ligne' : 'Hors ligne'}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.surfaceAlt,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <SettingsIcon size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCallPress}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={0.7}
          >
            <PhoneIcon size={16} color="#FAFAF9" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Call Type Sheet */}
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
        options={{
          header: () => <ChatHeader />,
        }}
      />
    </Stack>
  );
}
