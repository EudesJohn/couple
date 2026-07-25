// ============================================================
// Icônes SVG — inline SVG (sans react-native-svg)
// ============================================================
import { colors } from '../constants/theme';

export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function createIcon(path: string, viewBox = '0 0 24 24') {
  return ({ size = 24, color = colors.text, strokeWidth = 2 }: IconProps) => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={path} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Verrou
export const LockIcon = createIcon('M7 11V7a5 5 0 0 1 10 0v4m-5 4v3m-7-7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z');

// Déverrouillé / Cœur
export const HeartIcon = createIcon('M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z');

// Cœur rempli
export const HeartFilledIcon = ({ size = 24, color = colors.accent }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

// Enveloppe (messages)
export const MailIcon = createIcon('M22 6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6z M22 6l-10 7L2 6');

// Enveloppe remplie
export const MailOpenIcon = createIcon('M21 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8m18 0L12 3 3 10m18 0l-9 6-9-6');

// Microphone
export const MicIcon = createIcon('M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8');

// Appareil photo
export const CameraIcon = createIcon('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');

// Galerie
export const ImageIcon = createIcon('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12');

// Envoi (flèche)
export const SendIcon = createIcon('M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z');

// Retour
export const BackIcon = createIcon('M19 12H5m7-7l-7 7 7 7');

// Plus
export const PlusIcon = createIcon('M12 5v14m-7-7h14');

// Jouer
export const PlayIcon = createIcon('M10 8l6 4-6 4V8z');

// Pause
export const PauseIcon = createIcon('M6 4h4v16H6zM14 4h4v16h-4z');

// Téléphone
export const PhoneIcon = createIcon('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z');

// Vidéo
export const VideoIcon = createIcon('M23 7l-7 5 7 5V7z M2 7h14v10H2V7z');

// Paramètres (gear)
export const SettingsIcon = createIcon('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z');

// Check
export const CheckIcon = createIcon('M20 6L9 17l-5-5');

// Croix / Fermer
export const CloseIcon = createIcon('M18 6L6 18M6 6l12 12');

// Flèche haut
export const ArrowUpIcon = createIcon('M12 19V5m-7 7l7-7 7 7');

// Flèche bas
export const ArrowDownIcon = createIcon('M12 5v14m7-7l-7 7-7-7');

// Info
export const InfoIcon = createIcon('M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01');

// Alert
export const AlertIcon = createIcon('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01');

// Edit
export const EditIcon = createIcon('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');

// User
export const UserIcon = createIcon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z');

// Users (deux)
export const UsersIcon = createIcon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');

// Logout
export const LogOutIcon = createIcon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9');

// Onde (waveform audio)
export const WaveformIcon = ({ size = 24, color = colors.text, strokeWidth = 2 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="13" width="3" height="8" rx="1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <rect x="8" y="9" width="3" height="12" rx="1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <rect x="13" y="6" width="3" height="15" rx="1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <rect x="18" y="10" width="3" height="11" rx="1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

// Appel manqué
export const MissedCallIcon = createIcon('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z M22 2l-6 6m0-6l6 6');

// Raccrocher
export const PhoneOffIcon = createIcon('M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.06 19.06 0 0 1-3.46-2.79 M1 1l22 22');

// Typing indicator (3 dots)
export const TypingIcon = ({ size = 24, color = colors.textTertiary }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

// Haut-parleur / Volume
export const VolumeIcon = createIcon('M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07');

// Microphone coupé
export const MicOffIcon = createIcon('M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 4.11 2.78M19 10v2a7 7 0 0 1-2.64 5.36M12 19v3M8 22h8M1 1l22 22');

// Stop (carré)
export const StopIcon = ({ size = 24, color = colors.text }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="16" height="16" rx="3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Double check (lu/délivré)
export const DoubleCheckIcon = ({ size = 24, color = colors.text }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L7 17l-5-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 6l-11 11-2-2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Étoile / Sparkle
export const SparkleIcon = createIcon('M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z M9 15l-3 3m3 0l-3-3 M16 18l-2 2m2 0l-2-2');

// Répondre (flèche coudée vers la gauche)
export const ReplyIcon = createIcon('M9 10l-5 5 5 5 M20 4v7a4 4 0 0 1-4 4H4');
