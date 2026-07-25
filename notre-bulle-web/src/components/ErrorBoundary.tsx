// ============================================================
// Error Boundary premium — capture et affiche les erreurs
// Design Burgundy & Gold
// ============================================================
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertIcon } from './Icons';
import { colors, borderRadius, spacing } from '../constants/theme';

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
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
          minHeight: '100vh',
          backgroundColor: colors.background,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: colors.surface,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginBottom: spacing.lg,
            boxShadow: `0 2px 8px ${colors.shadow}`,
          }}>
            <AlertIcon size={32} color={colors.error} />
          </div>

          <h1 style={{
            fontSize: 28, fontWeight: 700, color: colors.text,
            marginBottom: spacing.sm, textAlign: 'center',
            letterSpacing: -0.5,
          }}>
            Une erreur est survenue
          </h1>

          <p style={{
            fontSize: 16, color: colors.textSecondary,
            marginBottom: spacing.lg, textAlign: 'center',
            fontFamily: 'monospace',
            backgroundColor: colors.surfaceAlt,
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: borderRadius.md,
          }}>
            {this.state.error?.message}
          </p>

          <div style={{
            flex: 1, width: '100%', maxHeight: 200, overflow: 'auto',
            backgroundColor: colors.surfaceAlt,
            borderRadius: borderRadius.md,
            padding: spacing.md, marginBottom: spacing.lg,
          }}>
            <pre style={{
              fontSize: 11, color: colors.textTertiary,
              fontFamily: 'monospace', lineHeight: '16px', margin: 0,
            }}>
              {this.state.error?.stack}
            </pre>
          </div>

          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              backgroundColor: colors.primary,
              padding: `${spacing.md}px ${spacing.xl}px`,
              borderRadius: borderRadius.lg,
              border: 'none', cursor: 'pointer',
              color: '#FAFAF9', fontSize: 16, fontWeight: 600,
              boxShadow: `0 4px 12px ${colors.glowBurgundy}`,
            }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
