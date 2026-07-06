// ============================================================
// Layout du Chat — header avec présence + bouton d'appel
// ============================================================
import { View, Text, TouchableOpacity, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { colors, typography } from '../../src/constants/theme';
import { usePresence } from '../../src/hooks/usePresence';
import { useCall } from '../../src/hooks/useCall';

const PARTNER_NAME = 'Ma chérie 💕';

function ChatHeader() {
  const { isPartnerOnline, partnerPresence } = usePresence();
  const { startCall } = useCall();
  const isTyping = partnerPresence?.is_typing ?? false;

  const handleCallPress = () => {
    const options = ['📞 Appel audio', '📹 Appel vidéo', 'Annuler'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 2,
          title: 'Appeler',
        },
        (index) => {
          if (index === 0) startCall('audio');
          if (index === 1) startCall('video');
        }
      );
    } else {
      Alert.alert('Appeler', '', [
        { text: '📞 Appel audio', onPress: () => startCall('audio') },
        { text: '📹 Appel vidéo', onPress: () => startCall('video') },
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {/* Infos partenaire */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ position: 'relative' }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.secondary,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>💕</Text>
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isPartnerOnline ? colors.online : colors.textTertiary,
              borderWidth: 2,
              borderColor: colors.surface,
            }}
          />
        </View>

        <View>
          <Text style={{ ...typography.subheading, fontSize: 17, color: colors.text }}>
            {PARTNER_NAME}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: isPartnerOnline ? colors.online : colors.textTertiary,
            }}
          >
            {isTyping ? 'Écrit…' : isPartnerOnline ? 'En ligne' : 'Hors ligne'}
          </Text>
        </View>
      </View>

      {/* Bouton d'appel */}
      <TouchableOpacity
        onPress={handleCallPress}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.surfaceAlt,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 18 }}>📞</Text>
      </TouchableOpacity>
    </View>
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
