import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({
      children,
      className,
      onClick,
      role,
      'aria-modal': ariaModal,
      'aria-labelledby': ariaLabelledBy,
      'aria-hidden': ariaHidden,
      ...rest
    }: any, ref: any) => (
      <div
        ref={ref}
        className={className}
        onClick={onClick}
        role={role}
        aria-modal={ariaModal}
        aria-labelledby={ariaLabelledBy}
        aria-hidden={ariaHidden}
      >
        {children}
      </div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Delete File',
    message: 'Are you sure you want to delete this file?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isOpen: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when isOpen is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete File')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this file?')
    ).toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
      />
    );
    expect(screen.getByText('No, Keep')).toBeInTheDocument();
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await userEvent.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when backdrop is clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    const backdrop = screen.getByRole('dialog').parentElement?.querySelector(
      '[aria-hidden="true"]'
    );
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('has correct ARIA attributes', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(screen.getByText('Delete File')).toHaveAttribute(
      'id',
      'confirm-dialog-title'
    );
  });

  it('traps focus within the dialog (Tab wraps from last to first)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Confirm');

    // Focus on confirm (last element), press Tab → should go to cancel (first)
    confirmBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('traps focus within the dialog (Shift+Tab wraps from first to last)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Confirm');

    // Focus on cancel (first element), press Shift+Tab → should go to confirm (last)
    cancelBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('returns focus to previously focused element on close', async () => {
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Open Dialog';
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const { rerender } = render(<ConfirmDialog {...defaultProps} />);

    // Close the dialog
    rerender(<ConfirmDialog {...defaultProps} isOpen={false} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(triggerButton);
    });

    document.body.removeChild(triggerButton);
  });
});
