import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from './ConfirmationDialog';

interface ConfirmationButtonProps extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
  /** Title for the confirmation dialog */
  dialogTitle: string;
  /** Description for the confirmation dialog */
  dialogDescription: string | ReactNode;
  /** Label for the confirm button in the dialog */
  confirmLabel?: string;
  /** Whether the action is destructive */
  destructive?: boolean;
  /** Called when the user confirms */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmationButton({
  dialogTitle,
  dialogDescription,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  children,
  ...buttonProps
}: ConfirmationButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={destructive ? 'destructive' : buttonProps.variant}
        {...buttonProps}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>

      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={confirmLabel}
        variant={destructive ? 'destructive' : 'default'}
        onConfirm={onConfirm}
      />
    </>
  );
}
