'use client';

import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/auth/AuthContext';
import styles from './login.module.css';

export function UserProfileBadge() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className={styles.userBadgeContainer} ref={containerRef} data-testid="user-profile-badge">
      <button
        type="button"
        className={styles.userBadgeButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`Tài khoản: ${user.name}`}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.name} className={styles.userAvatar} />
        ) : (
          <div className={styles.userAvatar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserIcon size={14} color="#94a3b8" />
          </div>
        )}
        <span>{user.name}</span>
        <ChevronDown size={14} color="#94a3b8" />
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu} role="menu">
          <div className={styles.dropdownHeader}>
            <div className={styles.dropdownUserName}>{user.name}</div>
            <div className={styles.dropdownUserEmail}>{user.email}</div>
          </div>

          <button
            type="button"
            className={`${styles.dropdownItem} ${styles.dropdownLogout}`}
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            role="menuitem"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogOut size={14} />
              <span>Đăng xuất</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
