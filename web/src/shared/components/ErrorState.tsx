import React from 'react';

export interface ErrorStateProps {
  code: string;
  message: string;
  correlationId: string;
  retryable?: boolean;
  onRetry?: () => void;
}

export function ErrorState({
  code,
  message,
  correlationId,
  retryable = false,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        padding: '1.5rem',
        background: 'rgba(248, 113, 113, 0.1)',
        border: '1px solid var(--accent-red, #f87171)',
        borderRadius: '0.5rem',
        color: '#fca5a5',
      }}
      data-testid="error-state"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span
          style={{
            background: 'var(--accent-red, #f87171)',
            color: '#000',
            fontWeight: 'bold',
            fontSize: '0.75rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
          }}
        >
          {code}
        </span>
        <strong style={{ fontSize: '0.875rem' }}>{message}</strong>
      </div>
      <p style={{ fontSize: '0.75rem', opacity: 0.8, fontFamily: 'monospace' }}>
        Correlation ID: {correlationId}
      </p>
      {retryable && onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: '0.75rem',
            padding: '0.375rem 0.75rem',
            background: 'var(--accent-red, #f87171)',
            color: '#0f172a',
            border: 'none',
            borderRadius: '0.25rem',
            fontWeight: 600,
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Retry Request
        </button>
      )}
    </div>
  );
}
