'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { BRAND, copyrightText } from '@/config/brand';

const MARK_ID = 'app-copyright-notice';

/**
 * Aviso de derechos de autor visible en la parte inferior de todas las pantallas.
 * Si el elemento se elimina u oculta desde el navegador (DevTools, extensiones, CSS),
 * se vuelve a insertar automáticamente.
 */
export function CopyrightNotice({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = copyrightText();
    const ensure = () => {
      let el = document.getElementById(MARK_ID);
      const hidden =
        el &&
        (() => {
          const s = window.getComputedStyle(el);
          return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.3 || el.offsetHeight === 0;
        })();
      if (!el || hidden || !el.textContent?.includes(BRAND.owner)) {
        el?.remove();
        el = document.createElement('div');
        el.id = MARK_ID;
        el.setAttribute('role', 'contentinfo');
        el.textContent = text;
        el.setAttribute(
          'style',
          'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;text-align:center;font:500 11px/22px system-ui,sans-serif;' +
            'background:rgba(15,23,42,.88);color:#e2e8f0;letter-spacing:.02em;pointer-events:none;display:block;visibility:visible;opacity:1',
        );
        document.body.appendChild(el);
      }
    };

    // Agrupa las comprobaciones: como máximo una por frame aunque el DOM cambie mucho
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        ensure();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    const interval = window.setInterval(ensure, 4000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      ref={ref}
      id={MARK_ID}
      role="contentinfo"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-[60] select-none border-t border-border/60 bg-background/85 py-1 text-center text-[11px] font-medium tracking-wide text-muted-foreground backdrop-blur',
        className,
      )}
    >
      {copyrightText()}
    </div>
  );
}
