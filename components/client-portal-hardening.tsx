export default function ClientPortalHardening() {
  return <style>{`
    /* Compatibility repair: the current Client Site Visits section has a malformed
       CSS-module class expression. Keep the production UI correct while the large
       legacy client page is progressively decomposed. */
    .portal-client #site-visits {
      border: 1px solid var(--lv-border-default);
      background: var(--lv-surface-panel);
      color: var(--lv-text-primary);
      border-radius: var(--lv-radius-lg);
      overflow: hidden;
      padding: 0;
      min-width: 0;
      box-shadow: var(--lv-shadow-sm);
    }
    .portal-client #site-visits a {
      color: var(--lv-brand-text) !important;
      font-weight: 800;
    }
    .portal-client #site-visits table {
      width: 100%;
    }
    .portal-client #site-visits > div:last-child {
      max-width: 100%;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
    }
    .portal-client :is(button,a,input,select,textarea):focus-visible {
      outline: 2px solid var(--lv-brand-primary);
      outline-offset: 2px;
    }
    @media (max-width: 700px) {
      .portal-client #site-visits {
        border-radius: 12px;
      }
      .portal-client #site-visits table {
        min-width: 680px;
      }
      .portal-client #site-visits th,
      .portal-client #site-visits td {
        white-space: normal;
        vertical-align: top;
      }
    }
  `}</style>;
}
