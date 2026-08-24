// ============================================================
// Layout du Chat — header premium avec présence + appels
// Design Burgundy & Gold, Framer Motion
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { usePresence } from '../hooks/usePresence';
import { useCall } from '../hooks/useCall';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { getActualPartnerProfileId } from '../lib/profile';
import { downloadMedia } from '../lib/media';
import { PhoneIcon, VideoIcon, HeartFilledIcon, CycleIcon, HistoryIcon, ImageIcon, SettingsIcon } from '../components/Icons';
import { CallTypeSheet } from '../components/call/CallTypeSheet';
import { IncomingCallBanner } from '../components/call/IncomingCallBanner';
import { MoreMenu } from '../components/ui/MoreMenu';

export default function ChatLayout() {
  const navigate = useNavigate();
  const { isPartnerOnline, partnerPresence, lastSeenLabel } = usePresence();
  const { startCall, incomingCall, answerCall, rejectCall, callState } = useCall();
  const { identity } = useAuth();
  const FALLBACK_NAME = identity === 'woman' ? 'Mon chéri' : 'Ma chérie';
  const isTyping = partnerPresence?.is_typing ?? false;
  const [callSheetVisible, setCallSheetVisible] = useState(false);
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState<string | null>(null);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(null);
  const avatarBlobUrlRef = useRef<string | null>(null);

  // Charger photo + pseudo du partenaire depuis la base
  useEffect(() => {
    let cancelled = false;

    async function loadPartnerProfile() {
      const partnerProfileId = getActualPartnerProfileId();
      if (!partnerProfileId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', partnerProfileId)
        .single();

      if (cancelled) return;
      if (error) return;

      if (data?.display_name) setPartnerDisplayName(data.display_name);
      if (data?.avatar_url) {
        try {
          const blob = await downloadMedia(data.avatar_url);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          avatarBlobUrlRef.current = url;
          setPartnerAvatarUrl(url);
        } catch {
          // Fallback silencieux → cœur
        }
      }
    }

    loadPartnerProfile();

    return () => {
      cancelled = true;
      if (avatarBlobUrlRef.current) {
        URL.revokeObjectURL(avatarBlobUrlRef.current);
        avatarBlobUrlRef.current = null;
      }
    };
  }, [identity]);

  const partnerName = partnerDisplayName || FALLBACK_NAME;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: colors.surface,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.borderLight}`,
        flexShrink: 0,
      }}>
        {/* Partenaire */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <div
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.surfaceDim,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {partnerAvatarUrl ? (
              <img
                src={partnerAvatarUrl}
                alt={partnerName}
                style={{
                  width: 40, height: 40,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <HeartFilledIcon size={18} color={colors.accent} />
            )}
            <div
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: isPartnerOnline ? colors.online : colors.textTertiary,
                border: `2.5px solid ${colors.surface}`,
              }}
            />
          </div>

          {/* Infos */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 17, fontWeight: 600, color: colors.text, letterSpacing: -0.3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '26vw',
            }}>
              {partnerName}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: isPartnerOnline ? colors.online : colors.textTertiary,
            }}>
              {isTyping ? 'Écrit...' : lastSeenLabel}
            </div>
          </div>
        </div>

        {/* Actions — les secondaires sont regroupées dans « ⋯ » pour
            laisser la place au pseudo du partenaire */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <MoreMenu
            ariaLabel="Menu"
            items={[
              {
                label: 'Nos souvenirs',
                icon: ImageIcon,
                color: colors.secondary,
                onClick: () => navigate('/gallery'),
              },
              {
                label: 'Journal des appels',
                icon: HistoryIcon,
                color: colors.textSecondary,
                onClick: () => navigate('/calls'),
              },
              {
                label: 'Cycle',
                icon: CycleIcon,
                color: colors.secondary,
                onClick: () => navigate('/cycle'),
              },
              {
                label: 'Paramètres',
                icon: SettingsIcon,
                color: colors.textSecondary,
                onClick: () => navigate('/settings'),
              },
            ]}
          />

          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setCallSheetVisible(true)}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.primary, border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}
            aria-label="Appeler"
          >
            <PhoneIcon size={16} color="#FAFAF9" />
          </motion.button>
        </div>
      </div>

      {/* Content (Outlet) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>

      {/* Call Type Sheet */}
      <CallTypeSheet
        visible={callSheetVisible}
        onClose={() => setCallSheetVisible(false)}
        onStartAudioCall={() => startCall('audio')}
        onStartVideoCall={() => startCall('video')}
      />

      {/* Appel entrant */}
      <IncomingCallBanner
        visible={callState === 'ringing' && incomingCall !== null}
        callType={incomingCall?.type || 'audio'}
        partnerName={partnerName}
        onAnswer={answerCall}
        onReject={rejectCall}
      />
    </div>
  );
}
