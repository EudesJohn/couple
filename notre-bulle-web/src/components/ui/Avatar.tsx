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
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {uri ? (
        <img
          src={uri}
          alt={name}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.secondary,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: size * 0.4,
              fontWeight: 600,
            }}
          >
            {initials}
          </span>
        </div>
      )}

      {isOnline !== undefined && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: isOnline ? colors.online : colors.textTertiary,
            border: `2px solid ${colors.surface}`,
          }}
        />
      )}
    </div>
  );
}
