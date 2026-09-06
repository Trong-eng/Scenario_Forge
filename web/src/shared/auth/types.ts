export type UserRole = 'user' | 'author' | 'reviewer' | 'operator' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  role: UserRole;
  created_at?: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface RoleConfig {
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  user: {
    label: 'Người dùng',
    description: 'Truy cập Scenario Forge',
    badgeBg: '#f0f9ff',
    badgeText: '#0369a1',
    badgeBorder: '#bae6fd',
  },
  author: { label: 'Tác giả', description: 'Tạo nội dung', badgeBg: '#f0fdf4', badgeText: '#166534', badgeBorder: '#bbf7d0' },
  reviewer: { label: 'Reviewer', description: 'Duyệt nội dung', badgeBg: '#fff7ed', badgeText: '#9a3412', badgeBorder: '#fed7aa' },
  operator: { label: 'Operator', description: 'Chạy mô phỏng', badgeBg: '#faf5ff', badgeText: '#7e22ce', badgeBorder: '#e9d5ff' },
  admin: { label: 'Admin', description: 'Quản trị hệ thống', badgeBg: '#fef2f2', badgeText: '#991b1b', badgeBorder: '#fecaca' },
};
