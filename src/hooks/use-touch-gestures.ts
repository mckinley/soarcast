/**
 * Custom hook for handling touch gestures
 * Supports: pinch-to-zoom, swipe left/right, tap
 */

import { useRef, useCallback, useEffect } from 'react';

interface TouchGestureHandlers {
  onPinchZoom?: (scale: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export function useTouchGestures(handlers: TouchGestureHandlers) {
  const touchStartRef = useRef<TouchPoint | null>(null);
  const lastTapRef = useRef<TouchPoint | null>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const currentScaleRef = useRef<number>(1);

  // Calculate distance between two touch points
  const getDistance = useCallback((touch1: Touch, touch2: Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single touch - record start position for swipe/tap detection
        const touch = e.touches[0];
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          timestamp: Date.now(),
        };
      } else if (e.touches.length === 2 && handlers.onPinchZoom) {
        // Two finger touch - start pinch zoom
        e.preventDefault();
        initialDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
        currentScaleRef.current = 1;
      }
    },
    [handlers.onPinchZoom, getDistance],
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistanceRef.current && handlers.onPinchZoom) {
        // Pinch zoom gesture
        e.preventDefault();
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialDistanceRef.current;

        // Only trigger if scale change is significant (> 5%)
        if (Math.abs(scale - currentScaleRef.current) > 0.05) {
          handlers.onPinchZoom(scale);
          currentScaleRef.current = scale;
        }
      }
    },
    [handlers, getDistance],
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 0 && touchStartRef.current) {
        const touchStart = touchStartRef.current;
        const changedTouch = e.changedTouches[0];
        const deltaX = changedTouch.clientX - touchStart.x;
        const deltaY = changedTouch.clientY - touchStart.y;
        const duration = Date.now() - touchStart.timestamp;

        // Determine if this was a swipe or tap
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance < 10 && duration < 300) {
          // Tap gesture
          const now = Date.now();
          const lastTap = lastTapRef.current;

          if (
            lastTap &&
            now - lastTap.timestamp < 300 &&
            Math.abs(lastTap.x - touchStart.x) < 20 &&
            Math.abs(lastTap.y - touchStart.y) < 20 &&
            handlers.onDoubleTap
          ) {
            // Double tap
            handlers.onDoubleTap(touchStart.x, touchStart.y);
            lastTapRef.current = null; // Reset after double tap
          } else {
            // Single tap
            if (handlers.onTap) {
              handlers.onTap(touchStart.x, touchStart.y);
            }
            lastTapRef.current = { ...touchStart, timestamp: now };
          }
        } else if (distance > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
          // Horizontal swipe (deltaX > 2 * deltaY ensures it's horizontal)
          if (deltaX > 0 && handlers.onSwipeRight) {
            handlers.onSwipeRight();
          } else if (deltaX < 0 && handlers.onSwipeLeft) {
            handlers.onSwipeLeft();
          }
        }

        touchStartRef.current = null;
      }

      // Reset pinch zoom
      if (e.touches.length < 2) {
        initialDistanceRef.current = null;
        currentScaleRef.current = 1;
      }
    },
    [handlers],
  );

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

/**
 * Hook to attach touch gesture handlers to an element ref
 */
export function useAttachTouchGestures<T extends HTMLElement>(
  elementRef: React.RefObject<T | null>,
  handlers: TouchGestureHandlers,
) {
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchGestures(handlers);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
