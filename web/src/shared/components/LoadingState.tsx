import React from 'react';

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div
      style={{
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        background: 'var(--bg-secondary, #1e293b)',
        borderRadius: '0.5rem',
        border: '1px solid var(--border-color, #334155)',
        color: 'var(--text-secondary, #94a3b8)',
      }}
      data-testid="loading-state"
    >
      <div
        style={{
          width: '1.75rem',
          height: '1.75rem',
          border: '3px solid #334155',
          borderTopColor: 'var(--accent-blue, #38bdf8)',
          borderRadius: '50%',
          margin: '0 auto 0.75rem auto',
        }}
      />
      <p style={{ fontSize: '0.875rem' }}>{message}</p>
    </div>
  );
}
