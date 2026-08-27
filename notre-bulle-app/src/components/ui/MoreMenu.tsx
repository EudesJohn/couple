// ============================================================
// Menu « ⋯ » — regroupe les actions secondaires du header
// Équivalent mobile de notre-bulle-web/src/components/ui/MoreMenu.tsx
// ============================================================
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../constants/theme';
import { MoreIcon } from '../Icons';

export interface MenuItem {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color?: string;
  onPress: () => void;
}

export function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel="Menu"
        style={styles.button}
      >
        <MoreIcon size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {/* Overlay */}
            <Pressable style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setOpen(false)} />

            {/* Menu ancré en haut à droite */}
            <View style={styles.menu}>
              {items.map((item, i) => {
                const Icon = item.icon;
                const itemColor = item.color || colors.textSecondary;
                return (
                  <View key={item.label}>
                    {i > 0 && <View style={styles.divider} />}
                    <TouchableOpacity
                      onPress={() => {
                        setOpen(false);
                        item.onPress();
                      }}
                      activeOpacity={0.7}
                      style={styles.menuItem}
                    >
                      <Icon size={17} color={itemColor} />
                      <Text style={[styles.menuItemText, { color: colors.text }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  menu: {
    position: 'absolute',
    top: 60,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    overflow: 'hidden',
    minWidth: 210,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
});
