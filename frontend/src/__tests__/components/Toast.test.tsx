import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/ui/Toast';
import { ReactNode } from 'react';

// Wrapper for renderHook
function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('Toast Notification System', () => {
  describe('ToastContext', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('showToast adds a toast to the list', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('Hello', 'success');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Hello');
      expect(result.current.toasts[0].type).toBe('success');
    });

    it('dismissToast removes a toast from the list', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('To dismiss', 'info');
      });

      const toastId = result.current.toasts[0].id;

      act(() => {
        result.current.dismissToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('auto-dismisses success toast after 5000ms', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('Auto dismiss', 'success');
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('auto-dismisses error toast after 8000ms', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('Error toast', 'error');
      });

      expect(result.current.toasts).toHaveLength(1);

      // Still visible after 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.toasts).toHaveLength(1);

      // Dismissed after 8 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('auto-dismisses info toast after 5000ms', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('Info toast', 'info');
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('supports custom duration', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('Custom', 'info', 2000);
      });

      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('can show multiple toasts simultaneously', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('First', 'success');
        result.current.showToast('Second', 'error');
        result.current.showToast('Third', 'info');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts[0].message).toBe('First');
      expect(result.current.toasts[1].message).toBe('Second');
      expect(result.current.toasts[2].message).toBe('Third');
    });

    it('throws error when useToast is used outside ToastProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => renderHook(() => useToast())).toThrow(
        'useToast must be used within a ToastProvider'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('ToastContainer rendering', () => {
    it('renders a success toast with role="alert" and green styling', () => {
      function Trigger() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('File uploaded!', 'success')}>Show</button>;
      }

      render(
        <ToastProvider>
          <Trigger />
          <ToastContainer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('File uploaded!');
      expect(alert.className).toContain('green');
    });

    it('renders an error toast with red styling', () => {
      function Trigger() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('Upload failed', 'error')}>Show</button>;
      }

      render(
        <ToastProvider>
          <Trigger />
          <ToastContainer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('red');
    });

    it('renders an info toast with blue styling', () => {
      function Trigger() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('Info', 'info')}>Show</button>;
      }

      render(
        <ToastProvider>
          <Trigger />
          <ToastContainer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('blue');
    });

    it('has a dismiss button with aria-label', () => {
      function Trigger() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('Dismiss me', 'info')}>Show</button>;
      }

      render(
        <ToastProvider>
          <Trigger />
          <ToastContainer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));

      const dismissBtn = screen.getByLabelText('Dismiss notification');
      expect(dismissBtn).toBeInTheDocument();
    });

    it('has aria-live="polite" on the container', () => {
      const { container } = render(
        <ToastProvider>
          <ToastContainer />
        </ToastProvider>
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('renders multiple toasts simultaneously', () => {
      function Trigger() {
        const { showToast } = useToast();
        return (
          <button onClick={() => {
            showToast('First', 'success');
            showToast('Second', 'error');
            showToast('Third', 'info');
          }}>Show All</button>
        );
      }

      render(
        <ToastProvider>
          <Trigger />
          <ToastContainer />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show All'));

      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(3);
    });
  });
});
