/**
 * A tiny, dependency-free floating-layer primitive: anchors a lightweight
 * panel to any element in the notebook and floats it above everything,
 * including the notebook's own scrolling and cell-virtualization/windowing
 * (SPEC: "Floating anchored popovers"). This is the *one* floating
 * implementation in the extension — the cell diff expansion, the
 * failed-run detail, and the "Ask about..." handoff affordances all use it
 * rather than each rolling their own.
 */
import { IDisposable } from '@lumino/disposable';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Options accepted by {@link Popover.open}. */
export interface IPopoverOptions {
  /** The element this popover is anchored to. */
  anchor: HTMLElement;
  /**
   * Builds the popover's content into `container`. `close` ends the
   * popover from inside the rendered content (e.g. a "Dismiss" button).
   */
  render: (container: HTMLElement, close: () => void) => void;
  /** Accessible label for the popover's `role="dialog"`. */
  ariaLabel: string;
  /** Called once the popover has closed, for any reason. */
  onClose?: () => void;
  /** Extra class name(s) applied to the popover's own node. */
  className?: string;
  /**
   * Whether opening the popover immediately moves keyboard focus into it.
   * Defaults to `true`, which is right for anything opened by a direct user
   * action (a click, a command). An ambient popover that appears on its own
   * — e.g. next to a fresh text selection — should pass `false` so it never
   * steals focus off whatever the human was doing; Tab still enters and is
   * trapped inside it once they choose to.
   */
  autoFocus?: boolean;
}

function focusablesIn(container: HTMLElement): HTMLElement[] {
  try {
    return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR));
  } catch {
    return [];
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

/**
 * A single open popover. Create one with {@link Popover.open}; it closes
 * itself (and disposes) on Escape, on an outside click, or when its anchor
 * scrolls out of view or is removed from the document — and can always be
 * closed directly by calling {@link dispose}. Closing restores focus to
 * whatever had it when the popover opened.
 */
export class Popover implements IDisposable {
  /** Opens a popover anchored to `options.anchor`. Never throws. */
  static open(options: IPopoverOptions): Popover {
    return new Popover(options);
  }

  private constructor(options: IPopoverOptions) {
    this._anchor = options.anchor;
    this._onCloseCallback = options.onClose;
    this._invoker = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);

    const node = document.createElement('div');
    node.className = 'jp-webmcp-Popover' + (options.className ? ' ' + options.className : '');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-label', options.ariaLabel);
    node.setAttribute('aria-modal', 'true');
    node.tabIndex = -1;
    this._node = node;

    try {
      options.render(node, () => this.dispose());
    } catch {
      // A broken render callback must not leave behind a half-open,
      // unclosable popover: it is still attached, positioned, and
      // dismissible below even if it renders empty.
    }

    document.body.appendChild(node);
    this._reposition();

    const reduceMotion = prefersReducedMotion();
    if (reduceMotion) {
      node.classList.add('jp-webmcp-Popover-open');
    } else {
      this._openFrame = requestAnimationFrame(() => {
        this._openFrame = null;
        if (!this._isDisposed) {
          node.classList.add('jp-webmcp-Popover-open');
        }
      });
    }

    if (options.autoFocus !== false) {
      const focusables = focusablesIn(node);
      (focusables[0] || node).focus();
    }

    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('pointerdown', this._onPointerDown, true);
    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange, true);

    try {
      this._observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting) {
          this.dispose();
        }
      });
      this._observer.observe(this._anchor);
    } catch {
      this._observer = null;
    }
  }

  /** Whether {@link dispose} has been called. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Closes the popover and restores focus to whatever invoked it. */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;

    if (this._openFrame !== null) {
      cancelAnimationFrame(this._openFrame);
      this._openFrame = null;
    }
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange, true);
    if (this._observer) {
      try {
        this._observer.disconnect();
      } catch {
        // Best effort.
      }
      this._observer = null;
    }

    const node = this._node;
    const finish = (): void => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    };
    if (prefersReducedMotion()) {
      finish();
    } else {
      node.classList.remove('jp-webmcp-Popover-open');
      setTimeout(finish, 160);
    }

    try {
      if (this._invoker && this._invoker.isConnected && typeof this._invoker.focus === 'function') {
        this._invoker.focus();
      }
    } catch {
      // Best-effort focus return only.
    }

    if (this._onCloseCallback) {
      try {
        this._onCloseCallback();
      } catch {
        // A caller's onClose must never break dispose().
      }
    }
  }

  private _reposition(): void {
    try {
      if (!this._anchor.isConnected) {
        this.dispose();
        return;
      }
      const anchorRect = this._anchor.getBoundingClientRect();
      const node = this._node;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const popRect = node.getBoundingClientRect();
      const width = popRect.width || 280;
      const height = popRect.height || 80;

      let top = anchorRect.bottom + margin;
      if (top + height > vh - margin && anchorRect.top - margin - height >= 0) {
        top = anchorRect.top - margin - height;
      }
      top = Math.max(margin, Math.min(top, Math.max(margin, vh - height - margin)));

      let left = anchorRect.left;
      if (left + width > vw - margin) {
        left = vw - width - margin;
      }
      left = Math.max(margin, left);

      node.style.position = 'fixed';
      node.style.top = `${top}px`;
      node.style.left = `${left}px`;
    } catch {
      // Presentation only: a positioning surprise must never propagate.
    }
  }

  private _onKeyDown = (event: KeyboardEvent): void => {
    try {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.dispose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      // Only trap Tab once focus is actually inside the popover. An
      // ambient, non-auto-focusing popover (e.g. the "Ask about this
      // output" chip) must never hijack Tab navigation elsewhere on the
      // page just because it happens to be open.
      const active = document.activeElement;
      if (!this._node.contains(active)) {
        return;
      }
      const focusables = focusablesIn(this._node);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    } catch {
      // Presentation only.
    }
  };

  private _onPointerDown = (event: PointerEvent): void => {
    try {
      const target = event.target as Node | null;
      if (!target || this._node.contains(target)) {
        return;
      }
      if (this._anchor === target || (typeof this._anchor.contains === 'function' && this._anchor.contains(target))) {
        return;
      }
      this.dispose();
    } catch {
      // Presentation only.
    }
  };

  private _onViewportChange = (): void => {
    if (this._isDisposed) {
      return;
    }
    this._reposition();
  };

  private _isDisposed = false;
  private _anchor: HTMLElement;
  private _node: HTMLDivElement;
  private _invoker: HTMLElement | null;
  private _observer: IntersectionObserver | null = null;
  private _openFrame: number | null = null;
  private _onCloseCallback?: () => void;
}
