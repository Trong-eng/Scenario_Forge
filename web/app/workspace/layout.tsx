import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Scenario Forge — CARLA scenario workspace',
  description: 'Author, validate, approve, run, and inspect reproducible CARLA scenarios.',
};

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
