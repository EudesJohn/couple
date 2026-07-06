import { View, Image, Text } from 'react-native';
import { colors } from '../../constants/theme';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  isOnline?: boolean;
}

export function Avatar({ uri, name, size = 40, isOnline }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={{ position: 'relative' }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.secondary,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: size * 0.4,
              fontWeight: '600',
            }}
          >
            {initials}
          </Text>
        </View>
      )}

      {isOnline !== undefined && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: isOnline ? colors.online : colors.textTertiary,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      )}
    </View>
  );
}
