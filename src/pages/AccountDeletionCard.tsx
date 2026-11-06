/**
 * Account-deletion card. It presents the confirmation flow, submits the
 * deletion request through the account controller, and reports its state.
 */
import React, { useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../auth/AuthProvider';
import {
  canSubmitAccountDeletion,
  getAccountDeletionReauthentication,
} from './accountDeletionUtils';

/** Owns destructive account state while keeping the card markup declarative. */
const useAccountDeletionAction = (reauthentication: ReturnType<typeof getAccountDeletionReauthentication>) => {
  const { deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = canSubmitAccountDeletion(confirmation, reauthentication, password);

  /** Attempts account deletion after confirmation and any required reauthentication. */
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(reauthentication === 'password' ? password : undefined);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete your account right now.');
      setDeleting(false);
    }
  };

  return {
    confirmation,
    setConfirmation,
    password,
    setPassword,
    deleting,
    deleteError,
    canDelete,
    handleDelete,
  };
};

/** Password field shown only for password-only Firebase accounts. */
const AccountDeletionPasswordField: React.FC<{
  visible: boolean;
  password: string;
  deleting: boolean;
  onChange: (value: string) => void;
}> = ({ visible, password, deleting, onChange }) => {
  if (!visible) return null;
  return (
    <div className="account-field-group">
      <label htmlFor="delete-account-password" className="text-sm font-medium text-foreground">
        Current password
      </label>
      <Input
        id="delete-account-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => onChange(event.target.value)}
        disabled={deleting}
      />
    </div>
  );
};

/** Renders the destructive account-deletion button label. */
const AccountDeletionButtonLabel: React.FC<{ deleting: boolean }> = ({ deleting }) => {
  if (deleting) return <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Deleting account…</>;
  return <><Trash2 className="mr-2 h-4 w-4" />Permanently delete account</>;
};

/** Renders the destructive account lifecycle control and provider reauthentication form. */
export const AccountDeletionCard: React.FC = () => {
  const { user } = useAuth();
  const reauthentication = getAccountDeletionReauthentication(user);
  const action = useAccountDeletionAction(reauthentication);

  return (
    <Card className="account-danger-card">
      <CardHeader className="account-section-header">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Trash2 className="h-6 w-6" />
          Delete account
        </CardTitle>
        <CardDescription>
          Permanently remove your hosted profile, settings, progress metrics, cloud cycles, and account sign-in.
          Local saves on this device are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="account-section-content">
        <AccountDeletionPasswordField
          visible={reauthentication === 'password'}
          password={action.password}
          deleting={action.deleting}
          onChange={action.setPassword}
        />
        <div className="account-field-group">
          <label htmlFor="delete-account-confirmation" className="text-sm font-medium text-foreground">
            Type DELETE to confirm
          </label>
          <Input
            id="delete-account-confirmation"
            value={action.confirmation}
            onChange={(event) => action.setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={action.deleting}
          />
        </div>
        <p className="account-support-copy">
          {reauthentication === 'unsupported'
            ? 'This sign-in method cannot be reauthenticated here. Contact support for account deletion.'
            : 'You will be asked to authenticate again.'}{' '}
          Any active premium subscription linked to this account will end.
          This action cannot be undone.
        </p>
        {action.deleteError ? <p className="account-error-box" role="alert">{action.deleteError}</p> : null}
        <Button
          variant="destructive"
          disabled={!action.canDelete || action.deleting}
          onClick={() => { action.handleDelete().catch(() => undefined); }}
        >
          <AccountDeletionButtonLabel deleting={action.deleting} />
        </Button>
      </CardContent>
    </Card>
  );
};
