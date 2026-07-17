import { useState } from 'react';

export function ErrorBanner({ message }: { message?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!message || dismissed) return null;
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  );
}