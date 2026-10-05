import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useSecurityGate } from '../../security/useSecurityGate';
import { SecuritySheet } from './SecuritySheet';
import { DangerSheet } from './DangerSheet';

/**
 * Full-screen overlay that shows the unofficial-app / update sheet above
 * everything else (login screen included). Rendered as a sibling of the app so
 * it is not skipped by the app's early returns.
 *
 * The unofficial case uses the danger design (and its warning sound); the update
 * case uses the standard M3 update sheet.
 */
export const SecurityOverlay: React.FC = () => {
  const { session, ready } = useAuth();
  const gate = useSecurityGate(ready, session.token);

  if (!gate.visible) return null;

  if (gate.mode === 'unofficial') {
    return (
      <DangerSheet
        phase={gate.phase}
        progress={gate.progress}
        received={gate.received}
        total={gate.total}
        speedBps={gate.speedBps}
        error={gate.error}
        onDownload={gate.onDownload}
        onContinue={gate.onContinue}
      />
    );
  }

  return (
    <SecuritySheet
      mode={gate.mode}
      version={gate.version}
      apkName={gate.apkName}
      phase={gate.phase}
      progress={gate.progress}
      received={gate.received}
      total={gate.total}
      speedBps={gate.speedBps}
      error={gate.error}
      onDownload={gate.onDownload}
      onLater={gate.onLater}
      onContinue={gate.onContinue}
    />
  );
};
