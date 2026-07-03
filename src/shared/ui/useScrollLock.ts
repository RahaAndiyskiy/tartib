'use client';

import { useEffect } from 'react';

type ScrollLockSnapshot = {
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  rootOverflow: string;
};

let lockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;

    const body = document.body;
    const root = document.documentElement;
    lockCount += 1;

    if (lockCount === 1) {
      snapshot = {
        scrollY: window.scrollY,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
        rootOverflow: root.style.overflow
      };
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${snapshot.scrollY}px`;
      body.style.width = '100%';
      root.style.overflow = 'hidden';
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0 || !snapshot) return;

      body.style.overflow = snapshot.bodyOverflow;
      body.style.position = snapshot.bodyPosition;
      body.style.top = snapshot.bodyTop;
      body.style.width = snapshot.bodyWidth;
      root.style.overflow = snapshot.rootOverflow;
      window.scrollTo(0, snapshot.scrollY);
      snapshot = null;
    };
  }, [active]);
}
