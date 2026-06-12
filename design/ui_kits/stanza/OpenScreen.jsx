/* Stanza UI kit — OpenScreen: launch view.
   Three paths in, each honest about project state:
   · New document        → template + priming
   · Stanza project      → has a Claude session; opens straight in
   · Plain LaTeX folder  → has work but no session; gets PRIMED first
     (parse blocks · init version control · start Claude session) */
(function () {
  const { Button, Badge, StatusDot } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  function Recent({ name, path, meta, state, blocks, onOpen }) {
    const [hover, setHover] = React.useState(false);
    const primed = state === 'session';
    return (
      <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
          padding: '12px 14px', background: hover ? 'var(--paper-1)' : 'var(--surface-card)',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
          boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-xs)', cursor: 'pointer',
          transition: 'box-shadow var(--dur-fast), background var(--dur-fast)'
        }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flex: '0 0 auto',
          borderRadius: 'var(--radius-md)',
          background: primed ? 'var(--clay-50)' : 'var(--surface-well)',
          color: primed ? 'var(--clay-600)' : 'var(--ink-400)'
        }}>
          {primed ? <I.FileText size={19} /> : <I.Folder size={19} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: 'var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)', color: 'var(--ink-900)' }}>{name}</span>
            {!primed && <Badge tone="neutral" size="sm">not set up</Badge>}
          </div>
          <div style={{ font: 'var(--text-xs)/1.4 var(--font-mono)', color: 'var(--ink-400)' }}>{path}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: '0 0 auto' }}>
          {primed
            ? <StatusDot tone="ok" label={`session · ${blocks} blocks`} />
            : <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: hover ? 'var(--clay-600)' : 'var(--ink-400)', fontWeight: 500 }}>{hover ? 'set up & open' : 'plain folder'}</span>}
          <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-300)' }}>{meta}</span>
        </div>
        <I.ChevronRight size={16} style={{ color: hover ? 'var(--clay-500)' : 'var(--ink-300)', flex: '0 0 auto' }} />
      </button>
    );
  }

  // Priming: turning a folder (or fresh template) into a working project.
  function PrimingOverlay({ project, steps, onDone, onCancel }) {
    const [done, setDone] = React.useState(0);
    React.useEffect(() => {
      if (done >= steps.length) { const t = setTimeout(onDone, 420); return () => clearTimeout(t); }
      const t = setTimeout(() => setDone((d) => d + 1), 520 + Math.random() * 420);
      return () => clearTimeout(t);
    }, [done]);

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(33, 30, 25, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'stz-fade-up 160ms var(--ease-out)' }}>
        <div style={{ width: 420, background: 'var(--paper-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <I.Sparkles size={16} style={{ color: 'var(--clay-500)' }} />
            <span style={{ font: 'var(--weight-semibold) var(--text-md)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}>Setting up {project}</span>
          </div>
          <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-500)', marginBottom: 16 }}>
            One-time setup — your files aren't changed until you accept an edit.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {steps.map((s, i) => {
              const state = i < done ? 'done' : i === done ? 'running' : 'pending';
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: state === 'pending' ? 0.42 : 1, transition: 'opacity var(--dur-fast)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flex: '0 0 auto' }}>
                    {state === 'done'
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--add-bg)', color: 'var(--add-600)' }}><I.Check size={10} stroke={3} /></span>
                      : state === 'running'
                        ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--clay-400)', animation: 'stz-pulse 0.9s var(--ease-in-out) infinite' }} />
                        : <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--line-ink)' }} />}
                  </span>
                  <span style={{ flex: 1, font: 'var(--text-sm)/1.3 var(--font-sans)', color: state === 'done' ? 'var(--ink-500)' : 'var(--ink-800)' }}>{s.label}</span>
                  {state === 'done' && s.result && <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>{s.result}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  const PRIME_FOLDER = (n) => [
    { label: 'Reading sources', result: '7 files' },
    { label: 'Parsing into blocks', result: `${n} blocks` },
    { label: 'Initializing version control', result: 'git init' },
    { label: 'Starting Claude session', result: 'primed' }
  ];
  const PRIME_NEW = [
    { label: 'Creating from template', result: 'article' },
    { label: 'Initializing version control', result: 'git init' },
    { label: 'Starting Claude session', result: 'primed' }
  ];

  function OpenScreen({ onOpen }) {
    const [priming, setPriming] = React.useState(null); // { project, steps }

    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-canvas)', padding: 40 }}>
        <div style={{ width: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 8 }}>
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="5.5" stroke="var(--ink-900)" strokeWidth="2.1"/>
              <line x1="9.5" y1="11.5" x2="22.5" y2="11.5" stroke="var(--ink-900)" strokeWidth="2.1" strokeLinecap="round"/>
              <line x1="9.5" y1="16" x2="19" y2="16" stroke="var(--clay-500)" strokeWidth="2.1" strokeLinecap="round"/>
              <line x1="9.5" y1="20.5" x2="23" y2="20.5" stroke="var(--ink-900)" strokeWidth="2.1" strokeLinecap="round"/>
            </svg>
            <div style={{ font: 'var(--weight-semibold) 30px/1 var(--font-serif)', color: 'var(--ink-900)', letterSpacing: '-0.01em' }}>Stanza</div>
          </div>
          <p style={{ font: 'var(--weight-regular) var(--text-lg)/1.5 var(--font-serif)', color: 'var(--ink-600)', margin: '0 0 26px' }}>
            Edit your LaTeX paper in the page. Select a block, say what you want, review the diff.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
            <Button variant="primary" size="lg" iconLeft={<I.Plus size={17} />}
              onClick={() => setPriming({ project: 'untitled-paper', steps: PRIME_NEW })}>New document</Button>
            <Button variant="secondary" size="lg" iconLeft={<I.Folder size={17} />}
              onClick={() => setPriming({ project: 'a LaTeX folder', steps: PRIME_FOLDER(9) })}>Open folder…</Button>
          </div>

          <div style={{ font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 10 }}>Recent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Recent name="block-editing" path="~/papers/block-editing" meta="2m ago"
              state="session" blocks={11} onOpen={onOpen} />
            <Recent name="thesis-ch3" path="~/papers/thesis/ch3" meta="yesterday"
              state="session" blocks={42} onOpen={onOpen} />
            <Recent name="neurips-submission" path="~/work/neurips-25" meta="3d ago"
              state="plain"
              onOpen={() => setPriming({ project: 'neurips-submission', steps: PRIME_FOLDER(28) })} />
          </div>

          <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--ink-400)', marginTop: 18 }}>
            Folders without a Claude session are set up on first open — blocks parsed, version control initialized, session primed.
          </div>
        </div>

        {priming && (
          <PrimingOverlay project={priming.project} steps={priming.steps}
            onDone={onOpen} onCancel={() => setPriming(null)} />
        )}
      </div>
    );
  }

  window.OpenScreen = OpenScreen;
})();
