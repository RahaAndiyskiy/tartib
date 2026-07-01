import { useEffect, useState } from 'react';

type DashboardNotice = {
  message: string;
  setMessage: (message: string) => void;
};

export function useDashboardNotice(timeoutMs = 3200): DashboardNotice {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [message, timeoutMs]);

  return {
    message,
    setMessage
  };
}
