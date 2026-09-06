import type { Metadata } from 'next';
import { LoginPage } from '@/features/auth/LoginPage';

export const metadata: Metadata = {
  title: 'Đăng nhập — Scenario Forge',
  description: 'Xác thực và phân quyền điều khiển hệ thống Scenario Forge.',
};

export default function Page() {
  return <LoginPage />;
}
