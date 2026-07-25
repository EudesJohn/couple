// ============================================================
// Layout du Chat — header premium avec présence + appels
// Design Burgundy & Gold, Framer Motion
// ============================================================
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { colors, spacing, borderRadius } from '../constants/theme';
import { usePresence } from '../hooks/usePresence';
import { useCall } from '../hooks/useCall';
import { PhoneIcon, VideoIcon, SettingsIcon, HeartFilledIcon } from '../components/Icons';
import { CallTypeSheet } from '../components/call/CallTypeSheet';

const PARTNER_NAME = 'Ma chérie';

export default function ChatLayout() {
  const navigate = useNavigate();
  const { isPartnerOnline, partnerPresence } = usePresence();
  const { startCall } = useCall();
  const isTyping = partnerPresence?.is_typing ?? false;
  const [callSheetVisible, setCallSheetVisible] = useState(false);

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
            }}
          >
            <HeartFilledIcon size={18} color={colors.accent} />
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
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: colors.text, letterSpacing: -0.3 }}>
              {PARTNER_NAME}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: isPartnerOnline ? colors.online : colors.textTertiary,
            }}>
              {isTyping ? 'Écrit...' : isPartnerOnline ? 'En ligne' : 'Hors ligne'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/settings')}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.surfaceAlt, border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <SettingsIcon size={18} color={colors.textSecondary} />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setCallSheetVisible(true)}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.primary, border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}
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
    </div>
  );
}
