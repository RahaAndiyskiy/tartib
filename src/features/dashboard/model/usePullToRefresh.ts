import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 108;

type PullToRefreshState = {
  isRefreshing: boolean;
  pullDistance: number;
};

export function usePullToRefresh(
  onRefresh: () => Promise<void>
): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startPointRef = useRef({ x: 0, y: 0 });
  const pullingRef = useRef(false);
  const distanceRef = useRef(0);

  const resetPull = useCallback((): void => {
    pullingRef.current = false;
    distanceRef.current = 0;
    setPullDistance(0);
  }, []);

  useEffect(() => {
    function overlayIsOpen(): boolean {
      return Boolean(
        document.querySelector(
          '[aria-modal="true"], .payment-drawer, .mobile-form-open'
        )
      );
    }

    function handleTouchStart(event: TouchEvent): void {
      if (
        isRefreshing ||
        event.touches.length !== 1 ||
        window.scrollY > 1 ||
        overlayIsOpen()
      ) {
        return;
      }

      const touch = event.touches[0];
      startPointRef.current = { x: touch.clientX, y: touch.clientY };
      pullingRef.current = true;
    }

    function handleTouchMove(event: TouchEvent): void {
      if (!pullingRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - startPointRef.current.x;
      const deltaY = touch.clientY - startPointRef.current.y;

      if (deltaY <= 0 || Math.abs(deltaX) > deltaY || window.scrollY > 1) {
        resetPull();
        return;
      }

      event.preventDefault();
      const resistedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.46);
      distanceRef.current = resistedDistance;
      setPullDistance(resistedDistance);
    }

    function handleTouchEnd(): void {
      if (!pullingRef.current) return;

      const shouldRefresh = distanceRef.current >= REFRESH_THRESHOLD;
      pullingRef.current = false;

      if (!shouldRefresh) {
        resetPull();
        return;
      }

      distanceRef.current = 56;
      setPullDistance(56);
      setIsRefreshing(true);
      void onRefresh().finally(() => {
        window.setTimeout(() => {
          setIsRefreshing(false);
          resetPull();
        }, 220);
      });
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', resetPull, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', resetPull);
    };
  }, [isRefreshing, onRefresh, resetPull]);

  return { isRefreshing, pullDistance };
}
