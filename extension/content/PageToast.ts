const TOAST_HOST_ID = 'gfe-ext-toast-host';

export class PageToast {
  private host: HTMLElement | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  show(type: 'success' | 'error', message: string): void {
    this.clear();

    const host = document.createElement('div');
    host.id = TOAST_HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .toast {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.45;
        pointer-events: auto;
        border: 1px solid;
        box-shadow: 0 4px 20px rgba(0,0,0,0.14), 0 1px 6px rgba(0,0,0,0.08);
        max-width: 320px;
        min-width: 200px;
        animation: slide-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .toast--success { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
      .toast--error   { background:#fef2f2; border-color:#fca5a5; color:#991b1b; }
      .icon { font-size:15px; font-weight:700; flex-shrink:0; line-height:1.45; }
      .msg  { flex:1; word-break:break-word; }
      .label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.6;
        margin-bottom: 3px;
      }
      .text { font-weight: 500; }
      @keyframes slide-in {
        from { opacity:0; transform:translateX(20px) scale(0.97); }
        to   { opacity:1; transform:translateX(0)    scale(1);    }
      }
      @media (prefers-color-scheme: dark) {
        .toast--success { background:#0d2818; border-color:#1a4d1a; color:#3fb950; }
        .toast--error   { background:#2d0000; border-color:#450a0a; color:#ff7b72; }
      }
    `;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : '✕';

    const msgWrap = document.createElement('span');
    msgWrap.className = 'msg';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = type === 'success' ? 'GFE Sync' : 'GFE Sync — Error';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = message;

    msgWrap.appendChild(label);
    msgWrap.appendChild(text);
    toast.appendChild(icon);
    toast.appendChild(msgWrap);
    shadow.appendChild(style);
    shadow.appendChild(toast);
    document.body?.appendChild(host);
    this.host = host;

    const startDismiss = (): void => {
      this.dismissTimer = setTimeout(() => this.clear(), 3000);
    };
    toast.addEventListener('mouseenter', () => {
      if (this.dismissTimer) clearTimeout(this.dismissTimer);
    });
    toast.addEventListener('mouseleave', () => startDismiss());
    startDismiss();
  }

  private clear(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.host?.remove();
    this.host = null;
    document.querySelector(`#${TOAST_HOST_ID}`)?.remove();
  }
}
