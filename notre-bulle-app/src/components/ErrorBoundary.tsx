// ============================================================
// Error Boundary premium — capture et affiche les erreurs
// Design Burgundy & Gold, AlertIcon
// ============================================================
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors, borderRadius, spacing, typography } from '../constants/theme';
import { AlertIcon } from './Icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('=== ERREUR CAPTURÉE ===', error.message, error.stack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <AlertIcon size={32} color={colors.error} />
          </View>
          <Text style={styles.title}>Une erreur est survenue</Text>
          <Text style={styles.message}>{this.state.error?.message}</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.stack}>{this.state.error?.stack}</Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            activeOpacity={0.8}
          >
            <Text style={styles.resetText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
    fontFamily: 'monospace',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxHeight: 200,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  stack: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  resetButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    shadowColor: colors.glowBurgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  resetText: {
    color: '#FAFAF9',
    fontSize: 16,
    fontWeight: '600',
  },
});
