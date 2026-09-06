import type { Metadata } from 'next';
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage';

export const metadata: Metadata = {
  title: 'Xác thực đăng nhập — Scenario Forge',
  description: 'Đang xử lý phiên đăng nhập...',
};

export default function Page() {
  return <AuthCallbackPage />;
}
