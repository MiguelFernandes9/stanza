/* Stanza UI kit — TitleBar (window chrome) */
(function () {
  const { IconButton, CompilePill, Tooltip } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  function TitleBar({ title, compile, onCompile, onToggleSource, sourceOpen, onToggleChat, chatOpen, onCloseDoc }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 'var(--rail-titlebar)', flex: '0 0 auto',
        padding: '0 12px',
        background: 'var(--surface-app)',
        borderBottom: '1px solid var(--border-default)',
        WebkitAppRegion: 'drag'
      }}>
        {/* traffic lights */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
          {['#E05D52', '#E5A93D', '#5BB85C'].map((c) => (
            <span key={c} onClick={onCloseDoc} style={{ width: 12, height: 12, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }} />
          ))}
        </div>

        {/* centered title */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" style={{ flex: '0 0 auto' }}>
            <rect x="4" y="4" width="24" height="24" rx="5.5" stroke="var(--ink-700)" strokeWidth="2.4"/>
            <line x1="9.5" y1="11.5" x2="22.5" y2="11.5" stroke="var(--ink-700)" strokeWidth="2.4" strokeLinecap="round"/>
            <line x1="9.5" y1="16" x2="19" y2="16" stroke="var(--clay-500)" strokeWidth="2.4" strokeLinecap="round"/>
            <line x1="9.5" y1="20.5" x2="23" y2="20.5" stroke="var(--ink-700)" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <span style={{ font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-800)' }}>{title}</span>
          <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>— main.tex</span>
        </div>

        {/* right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', WebkitAppRegion: 'no-drag' }}>
          <CompilePill state={compile.state} errors={compile.errors} warnings={compile.warnings} onClick={onCompile} />
          <Tooltip label="Recompile" hint="⌘R" side="bottom">
            <IconButton label="Recompile" onClick={onCompile}><I.Refresh size={17} /></IconButton>
          </Tooltip>
          <Tooltip label="Source editor" hint="⌘E" side="bottom">
            <IconButton label="Source editor" active={sourceOpen} onClick={onToggleSource}><I.Code size={17} /></IconButton>
          </Tooltip>
          <Tooltip label="Assistant panel" hint="⌘J" side="bottom">
            <IconButton label="Assistant panel" active={chatOpen} onClick={onToggleChat}><I.Sparkles size={17} /></IconButton>
          </Tooltip>
          <IconButton label="Settings"><I.Settings size={17} /></IconButton>
        </div>
      </div>
    );
  }

  window.TitleBar = TitleBar;
})();
