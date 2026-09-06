import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceCanvasDemo } from '../../../src/components/forge/WorkspaceCanvasDemo';

describe('WorkspaceCanvasDemo', () => {
  it('walks through Chat, Structured, Build approval, and a completed Run', () => {
    render(<WorkspaceCanvasDemo />);

    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Bảng dựng kịch bản' })).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Scenario prompt' }), {
      target: { value: 'Người đi bộ băng qua trước ego trên Town05, trời mưa.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu demo' }));

    expect(screen.queryByRole('region', { name: 'Bảng dựng kịch bản' })).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Scenario prompt' }) as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Gửi tin nhắn demo' })).toBeDefined();
    expect(screen.getByText('Demo UI · Không chạy CARLA')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Mở canvas: Definition v1' }));
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeDefined();
    expect(screen.queryByRole('tablist', { name: 'Definition views' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Global' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Phóng to canvas' }));
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' }).getAttribute('data-presentation')).toBe('fullscreen');
    fireEvent.click(screen.getByRole('button', { name: 'Thu canvas về panel' }));
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' }).getAttribute('data-presentation')).toBe('split');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng canvas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở canvas: Definition v1' }));
    expect(screen.getByRole('region', { name: 'Bảng dựng kịch bản' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Neo và dựng Scenic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve build' }));
    fireEvent.click(screen.getByRole('button', { name: /Chạy nhanh/i }));

    expect(screen.getByText('run-demo-42')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Video' })).toBeDefined();
    expect(screen.getByText('Chi tiết kỹ thuật').closest('details')?.open).toBe(false);
  });
});
