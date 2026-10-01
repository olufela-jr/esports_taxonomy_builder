import { useLayoutEffect, useRef, type RefObject } from 'react';

// Animates children marked data-flip-id from where they were to where they
// are whenever `order` changes (FLIP). Positions are measured relative to the
// container, so scrolling between renders does not count as movement.
export function useFlip(container: RefObject<HTMLElement | null>, order: string) {
  const positions = useRef(new Map<string, { left: number; top: number }>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const origin = root.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((element) => {
      const id = element.dataset.flipId ?? '';
      const rect = element.getBoundingClientRect();
      const position = { left: rect.left - origin.left, top: rect.top - origin.top };
      next.set(id, position);
      const previous = positions.current.get(id);
      if (reduce || !previous || (previous.left === position.left && previous.top === position.top)) return;
      element.style.transition = 'none';
      element.style.transform = `translate(${previous.left - position.left}px, ${previous.top - position.top}px)`;
      requestAnimationFrame(() => {
        element.style.transition = 'transform 220ms ease';
        element.style.transform = '';
      });
    });
    positions.current = next;
  }, [container, order]);
}
