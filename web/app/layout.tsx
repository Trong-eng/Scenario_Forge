import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/plus-jakarta-sans';
import { AuthProvider } from '@/shared/auth/AuthContext';
import { PreferencesProvider } from '@/shared/preferences/PreferencesContext';
import { themeScript } from '@/shared/preferences/themeScript';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scenario Forge',
  description: 'Tạo, kiểm định và phê duyệt kịch bản mô phỏng CARLA có thể truy vết.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Stamps the theme attributes before the first paint. Without it a
            dark-theme user gets a white flash on every navigation. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* Preferences sit inside Auth: they are per-account, so the provider
            needs to know whether there is an account before asking the server
            for them. The theme itself still comes from the pre-paint script,
            so every page is themed whether or not anyone is signed in. */}
        <AuthProvider>
          <PreferencesProvider>{children}</PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
