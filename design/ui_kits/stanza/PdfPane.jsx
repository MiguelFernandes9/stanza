/* Stanza UI kit — PdfPane: rendered paper with addressable blocks + the
   left margin rail. Each edit task is a card in the margin, vertically
   aligned with its block (collision-stacked), so parallel Claude tasks
   are each visible: compose → busy → review, in place. */
(function () {
  const { IconButton, SegmentedControl, Button, BlockTag, DiffHunk, Kbd } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  const GLYPH = { section: '§', paragraph: '¶', equation: '∑', figure: '❏', table: '▦', citation: '†', title: '§' };
  const RAIL = 316;   // margin-card column width
  const GAP = 22;     // gap between rail and page
  const PAGE = 564;   // page width

  function blockLabel(b) {
    if (b.kind === 'section') return b.text.replace(/^\d+\s+/, '');
    if (b.kind === 'equation') return `eq (${b.num})`;
    if (b.kind === 'title') return 'Title';
    const map = { 's1-p1': 'Opening paragraph', abstract: 'Abstract', authors: 'Authors', affil: 'Affiliation' };
    return map[b.id] || 'Paragraph';
  }

  // Combined span for a multi-block (section) task: "main.tex:24–31"
  function combineSpan(blocks) {
    const file = blocks[0].file.split('/').pop();
    const nums = blocks.flatMap((b) => String(b.span).split('–').map((s) => parseInt(s, 10))).filter((n) => !isNaN(n));
    return `${file}:${Math.min(...nums)}–${Math.max(...nums)}`;
  }

  function Block({ b, mark, hovered, onEnter, onLeave, onClick, refCb }) {
    // mark: { phase, active } when the block belongs to a task; null otherwise.
    // Quiet by default — an edge bar in the page margin; full wash only for
    // the ACTIVE task's block, so many parallel tasks stay readable.
    const barColor = mark ? (mark.phase === 'review' ? 'var(--clay-500)' : mark.phase === 'busy' ? 'var(--clay-400)' : 'var(--clay-300)') : 'transparent';
    const locked = mark && (mark.phase === 'busy' || mark.phase === 'review');
    const base = {
      position: 'relative', cursor: mark && mark.phase === 'busy' ? 'progress' : 'pointer',
      borderRadius: 'var(--radius-sm)',
      transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      boxShadow: mark && mark.active ? 'inset 0 0 0 1.5px var(--select-edge)'
        : hovered ? 'inset 0 0 0 1px var(--hover-edge)' : 'inset 0 0 0 1px transparent',
      background: mark && mark.active ? 'var(--select-fill)' : hovered ? 'var(--hover-fill)' : 'transparent'
    };

    let inner = null;
    const serif = 'var(--font-serif)';
    if (b.kind === 'title') {
      inner = <div style={{ font: `var(--weight-semibold) 25px/1.18 ${serif}`, color: 'var(--ink-900)', textAlign: 'center', letterSpacing: '-0.01em' }}>{b.text}</div>;
    } else if (b.kind === 'section' && b.heading) {
      inner = <div style={{ font: `var(--weight-semibold) 15px/1.3 ${serif}`, color: 'var(--ink-900)', textAlign: 'center' }}>{b.text}</div>;
    } else if (b.kind === 'section') {
      inner = <div style={{ font: `var(--weight-semibold) 17px/1.3 ${serif}`, color: 'var(--ink-900)' }}>{b.text}</div>;
    } else if (b.kind === 'equation') {
      inner = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '4px 0' }}>
          <span style={{ font: `italic var(--weight-regular) 16px/1.5 ${serif}`, color: 'var(--ink-900)' }}
            dangerouslySetInnerHTML={{ __html: b.text.replace(/\\mathcal\{B\}/g, '\u212C').replace(/\\textsf\{(\w+)\}/g, '<span style="font-style:normal">$1</span>').replace(/\\longmapsto/g, '\u27FC').replace(/\\,|\\;/g, ' ').replace(/\\ell/g, '\u2113') }} />
          <span style={{ font: `15px/1 ${serif}`, color: 'var(--ink-500)' }}>({b.num})</span>
        </div>
      );
    } else {
      const indent = (b.id === 's1-p1' || b.id === 's2-p1') ? '1.4em' : '0';
      inner = <div style={{ font: `var(--weight-regular) 14.5px/1.62 ${serif}`, color: b.id === 'affil' ? 'var(--ink-500)' : 'var(--ink-900)', textAlign: b.id === 'authors' || b.id === 'affil' ? 'center' : 'justify', textIndent: indent, fontStyle: b.id === 'affil' ? 'italic' : 'normal' }}>{b.text}</div>;
    }

    return (
      <div ref={refCb} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}
        style={{ ...base, padding: '5px 8px', margin: '0 -8px' }}>
        {/* margin edge bar — the quiet “this block has a task” marker */}
        {mark && (
          <span style={{ position: 'absolute', left: -26, top: 3, bottom: 3, width: 3, borderRadius: 2, background: barColor }} />
        )}
        {hovered && (
          <span style={{
            position: 'absolute', top: -9, left: -1, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 17, padding: '0 6px',
            background: locked ? 'var(--ink-500)' : 'var(--ink-700)',
            color: '#fff', borderRadius: 'var(--radius-pill)',
            font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)', letterSpacing: '0.02em',
            boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', whiteSpace: 'nowrap'
          }}>
            {locked
              ? <I.Lock size={10} />
              : <span style={{ fontFamily: 'var(--font-serif)', fontSize: 11 }}>{GLYPH[b.kind] || '§'}</span>}
            {locked
              ? (mark.phase === 'busy' ? 'Claude editing — locked' : 'awaiting review')
              : `${b.file.split('/').pop()}:${b.span}`}
          </span>
        )}
        {inner}
      </div>
    );
  }

  // One margin card = one Claude task. Only the ACTIVE task expands; the
  // rest collapse to one-line chips so a crowded rail stays scannable.
  function TaskCard({ task, blocks, expanded, adding, onToggleAdding, onRemoveBlock, onActivate, onUpdate, onSubmit, onDismiss, onResolve, onOpenReview, refCb }) {
    const taRef = React.useRef(null);
    React.useEffect(() => { if (expanded && task.phase === 'compose' && taRef.current) taRef.current.focus(); }, [task.phase, expanded]);
    const phaseColor = task.phase === 'review' ? 'var(--clay-500)' : task.phase === 'busy' ? 'var(--clay-400)' : 'var(--line-ink)';
    const b0 = blocks[0];
    // a "section task" = exactly the full block set of one section
    const allPaper = window.STZ_PAPER.blocks;
    const sec = b0 && b0.sec;
    const isSection = blocks.length > 1 && sec && blocks.every((b) => b.sec === sec)
      && allPaper.filter((b) => b.sec === sec).length === blocks.length;
    const spanRef = b0 ? (blocks.length > 1 ? combineSpan(blocks) : `${b0.file.split('/').pop()}:${b0.span}`) : '';

    if (!expanded) {
      return (
        <div ref={refCb} onClick={onActivate} style={{ position: 'relative', cursor: 'pointer' }}>
          <div style={{ position: 'absolute', top: 16, right: -GAP, width: GAP, height: 1.5, background: phaseColor, opacity: 0.4 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px',
            background: task.phase === 'review' ? 'var(--clay-50)' : 'var(--surface-overlay)',
            border: `1px solid ${task.phase === 'review' ? 'var(--clay-200)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)'
          }}>
            {task.phase === 'busy'
              ? <span style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%', background: 'var(--clay-400)', animation: 'stz-pulse 1s var(--ease-in-out) infinite' }} />
              : <I.Sparkles size={12} style={{ color: phaseColor, flex: '0 0 auto' }} />}
            <span style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)', color: task.phase === 'review' ? 'var(--clay-700)' : 'var(--ink-600)', whiteSpace: 'nowrap' }}>
              {task.phase === 'review' ? 'Proposal ready' : task.phase === 'busy' ? 'Editing…' : 'Draft edit'}
            </span>
            <span style={{ flex: 1, minWidth: 0, font: 'var(--text-2xs)/1.3 var(--font-sans)', color: 'var(--ink-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: 'italic' }}>
              {task.instruction ? `“${task.instruction}”` : ''}
            </span>
            <span style={{ flex: '0 0 auto', font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>{spanRef}</span>
          </div>
        </div>
      );
    }

    return (
      <div ref={refCb} style={{ position: 'relative' }}>
        {/* connector to the page */}
        <div style={{ position: 'absolute', top: 18, right: -GAP, width: GAP, height: 1.5, background: phaseColor, opacity: 0.55 }} />
        <div style={{
          background: 'var(--surface-overlay)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
          padding: 10, animation: 'stz-fade-up 180ms var(--ease-out)'
        }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <I.Sparkles size={13} style={{ color: phaseColor, flex: '0 0 auto' }} />
            <span style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-800)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase' }}>
              {task.phase === 'review' ? 'Proposed change' : task.phase === 'busy' ? 'Editing' : 'Edit with Claude'}
            </span>
            <div style={{ flex: 1 }} />
            {task.phase !== 'busy' && (
              <IconButton size="sm" label="Dismiss" onClick={onDismiss}><I.X size={13} /></IconButton>
            )}
          </div>

          {/* block tags — a whole-section task shows ONE combined tag; ad-hoc
              multi-block selections list each block (removable while drafting) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            {isSection ? (
              <BlockTag kind="section" label={blockLabel(blocks.find((b) => b.kind === 'section') || blocks[0])}
                span={spanRef} active
                onRemove={task.phase === 'compose' ? onDismiss : undefined} />
            ) : blocks.map((b) => (
              <BlockTag key={b.id} kind={b.kind === 'title' ? 'section' : b.kind} label={blockLabel(b)}
                span={`${b.file.split('/').pop()}:${b.span}`} active
                onRemove={task.phase === 'compose' ? () => onRemoveBlock(b.id) : undefined} />
            ))}
            {task.phase === 'compose' && (
              <button onClick={onToggleAdding} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px',
                borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: `1px ${adding ? 'solid var(--clay-400)' : 'dashed var(--line-ink)'}`,
                background: adding ? 'var(--clay-50)' : 'transparent',
                color: adding ? 'var(--clay-700)' : 'var(--ink-500)',
                font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)'
              }}>
                <I.Plus size={11} /> blocks
              </button>
            )}
          </div>

          {task.phase === 'compose' && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 7,
                background: 'var(--surface-card)', border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)', padding: '6px 6px 6px 10px'
              }}>
                <textarea ref={taRef} value={task.instruction}
                  onChange={(e) => onUpdate({ instruction: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
                    if (e.key === 'Escape') onDismiss();
                  }}
                  rows={2} placeholder="What should change in this block…"
                  style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', font: 'var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)', color: 'var(--ink-900)', maxHeight: 84, padding: '3px 0' }} />
                <Button size="sm" variant="primary" disabled={!task.instruction.trim()} onClick={onSubmit} iconLeft={<I.ArrowUp size={13} />}>Run</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 1, flexWrap: 'wrap' }}>
                {adding ? (
                  <span style={{ font: 'var(--weight-medium) var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--clay-600)' }}>Click blocks in the page to add them ·</span>
                ) : (
                  <span style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-400)' }}><Kbd>⇧</Kbd> click — add block ·</span>
                )}
                <Kbd>↵</Kbd>
                <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>run ·</span>
                <Kbd>esc</Kbd>
                <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>dismiss</span>
              </div>
            </div>
          )}

          {task.phase === 'busy' && (
            <div>
              <div style={{ font: 'italic var(--weight-regular) var(--text-sm)/1.45 var(--font-serif)', color: 'var(--ink-600)', marginBottom: 8 }}>“{task.instruction}”</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[0, 1, 2].map((n) => <span key={n} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--clay-400)', animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite` }} />)}
                </span>
                <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>claude -p · {blocks[0] ? blocks[0].file : ''}</span>
              </div>
            </div>
          )}

          {task.phase === 'review' && (
            <div>
              <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', margin: '0 1px 8px' }}>{task.proposal.note}</div>
              <div style={{ maxHeight: 192, overflow: 'auto', borderRadius: 'var(--radius-md)' }}>
                <DiffHunk file={task.proposal.files[0]} diff={task.proposal.diff} compact />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
                <Button size="sm" variant="primary" iconLeft={<I.Check size={13} />} onClick={() => onResolve('accept')}>Accept</Button>
                <Button size="sm" variant="secondary" iconLeft={<I.X size={13} />} onClick={() => onResolve('reject')}>Reject</Button>
                <div style={{ flex: 1 }} />
                <Button size="sm" variant="subtle" iconLeft={<I.Maximize size={12} />} onClick={onOpenReview}>Review</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full-screen review: the change ALREADY COMPILED — rendered current vs
  // proposed paragraphs side by side, with word-level marks. Source diff
  // available behind a toggle.
  function ReviewOverlay({ task, blocks, onClose, onResolve }) {
    const [mode, setMode] = React.useState('compiled');
    React.useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onResolve('accept');
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
    const p = task.proposal;
    const b0 = blocks[0];

    const MARK = {
      k: {},
      d: { background: 'var(--del-bg)', color: 'var(--del-700)', textDecoration: 'line-through', textDecorationColor: 'var(--del-600)', textDecorationThickness: '1px', borderRadius: 2, padding: '0 1px' },
      a: { background: 'var(--add-bg)', color: 'var(--add-700)', borderRadius: 2, padding: '0 1px' }
    };
    const Rendered = ({ segs }) => (
      <div style={{ font: 'var(--weight-regular) 15px/1.66 var(--font-serif)', color: 'var(--ink-900)', textAlign: 'justify', textIndent: '1.4em' }}>
        {segs.map(([t, s], i) => <span key={i} style={MARK[t]}>{s}</span>)}
      </div>
    );
    const Pane = ({ eyebrow, hint, segs, accent }) => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
          <span style={{ font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: accent || 'var(--ink-400)' }}>{eyebrow}</span>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{hint}</span>
        </div>
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-page)', padding: '22px 24px' }}>
          <Rendered segs={segs} />
        </div>
      </div>
    );

    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(33, 30, 25, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'stz-fade-up 160ms var(--ease-out)' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(880px, 92vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--paper-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-default)' }}>
            <I.Sparkles size={15} style={{ color: 'var(--clay-500)' }} />
            <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>Review change</span>
            {b0 && <BlockTag kind={blocks.length > 1 ? 'section' : b0.kind} label={blocks.length > 1 ? blockLabel(blocks.find((b) => b.kind === 'section') || b0) : blockLabel(b0)} span={blocks.length > 1 ? combineSpan(blocks) : `${b0.file.split('/').pop()}:${b0.span}`} active />}
            <div style={{ flex: 1 }} />
            <SegmentedControl size="sm" value={mode} onChange={setMode}
              options={[{ value: 'compiled', label: 'Compiled' }, { value: 'source', label: 'Source' }]} />
            <IconButton size="sm" label="Close" onClick={onClose}><I.X size={15} /></IconButton>
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
            <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', marginBottom: 14 }}>{p.note}</div>
            {mode === 'compiled' ? (
              <div style={{ display: 'flex', gap: 16 }}>
                <Pane eyebrow="Current" hint="main.pdf" segs={p.before} />
                <Pane eyebrow="Proposed" hint="after recompile" segs={p.after} accent="var(--clay-600)" />
              </div>
            ) : (
              <DiffHunk file={p.files[0]} diff={p.diff} />
            )}
          </div>

          {/* footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-app)', borderRadius: '0 0 var(--radius-xl) var(--radius-xl)' }}>
            <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>claude -p · {p.files[0]}</span>
            <div style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 6 }}><Kbd>⌘</Kbd><Kbd>↵</Kbd></span>
            <Button size="md" variant="secondary" iconLeft={<I.X size={14} />} onClick={() => onResolve('reject')}>Reject</Button>
            <Button size="md" variant="primary" iconLeft={<I.Check size={14} />} onClick={() => onResolve('accept')}>Accept</Button>
          </div>
        </div>
      </div>
    );
  }

  function PdfPane({ paper, tasks, blocksOf, activeTask, onActivateTask, adding, onToggleAdding, onRemoveBlockFromTask, selected, onToggleBlock, view, onView, onUpdateTask, onSubmitTask, onDismissTask, onResolveTask }) {
    const [hover, setHover] = React.useState(null);
    const [reviewId, setReviewId] = React.useState(null);
    const reviewTask = tasks.find((t) => t.id === reviewId && t.phase === 'review');
    // block id → { phase, active } for the quiet margin markers
    const marks = {};
    for (const t of tasks) for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === activeTask };
    const wrapRef = React.useRef(null);
    const blockEls = React.useRef({});
    const cardEls = React.useRef({});
    const [tops, setTops] = React.useState({});

    // Align cards with their blocks; stack on collision.
    React.useLayoutEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wTop = wrap.getBoundingClientRect().top;
      const ideal = tasks
        .map((t) => {
          const el = blockEls.current[t.blockIds[0]];
          return { id: t.id, top: el ? el.getBoundingClientRect().top - wTop - 4 : 0 };
        })
        .sort((a, b) => a.top - b.top || (a.id === undefined ? 0 : 0));
      let cursor = 0;
      const next = {};
      for (const it of ideal) {
        const h = (cardEls.current[it.id] && cardEls.current[it.id].offsetHeight) || 120;
        const top = Math.max(it.top, cursor);
        next[it.id] = top;
        cursor = top + h + 14;
      }
      setTops((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    });

    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
        {/* pane toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 'var(--rail-toolbar)', flex: '0 0 auto', padding: '0 14px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-app)' }}>
          <span style={{ font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)', color: 'var(--ink-500)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase' }}>Preview</span>
          <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>main.pdf</span>
          {tasks.length > 0 && (
            <span style={{ font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)', color: 'var(--clay-600)', background: 'var(--clay-50)', padding: '3px 8px', borderRadius: 'var(--radius-pill)' }}>
              {tasks.length} task{tasks.length > 1 ? 's' : ''}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <SegmentedControl size="sm" value={view} onChange={onView}
            options={[{ value: 'read', label: 'Read' }, { value: 'select', label: 'Select blocks' }]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
            <IconButton size="sm" label="Zoom out"><I.ZoomOut size={15} /></IconButton>
            <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', width: 32, textAlign: 'center' }}>110%</span>
            <IconButton size="sm" label="Zoom in"><I.ZoomIn size={15} /></IconButton>
          </div>
        </div>

        {/* page scroll area: margin rail (cards) + page */}
        <div style={{ flex: 1, overflow: 'auto', padding: '26px 24px 40px' }}>
          <div ref={wrapRef} style={{ position: 'relative', width: RAIL + GAP + PAGE, margin: '0 auto', minHeight: '100%' }}>
            {/* margin rail */}
            {tasks.map((t) => (
              <div key={t.id} style={{ position: 'absolute', left: 0, top: tops[t.id] ?? 0, width: RAIL, zIndex: t.id === activeTask ? 6 : 5, transition: 'top var(--dur-base, 200ms) var(--ease-out)' }}>
                <TaskCard task={t} blocks={blocksOf(t)}
                  expanded={t.id === activeTask}
                  adding={adding} onToggleAdding={onToggleAdding}
                  onRemoveBlock={(bid) => onRemoveBlockFromTask(t.id, bid)}
                  onActivate={() => onActivateTask(t.id)}
                  refCb={(el) => { cardEls.current[t.id] = el; }}
                  onUpdate={(patch) => onUpdateTask(t.id, patch)}
                  onSubmit={() => onSubmitTask(t.id)}
                  onDismiss={() => onDismissTask(t.id)}
                  onResolve={(v) => onResolveTask(t.id, v)}
                  onOpenReview={() => setReviewId(t.id)} />
              </div>
            ))}

            {/* the page */}
            <div style={{
              marginLeft: RAIL + GAP, width: PAGE,
              background: 'var(--paper-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              boxShadow: 'var(--shadow-lg)',
              padding: '52px 56px 60px',
              display: 'flex', flexDirection: 'column', gap: 11
            }}>
              {paper.blocks.map((b) => (
                <React.Fragment key={b.id}>
                  <Block b={b} mark={marks[b.id] || null} hovered={view === 'select' && hover === b.id}
                    refCb={(el) => { blockEls.current[b.id] = el; }}
                    onEnter={() => setHover(b.id)} onLeave={() => setHover((h) => h === b.id ? null : h)}
                    onClick={(e) => view === 'select' && onToggleBlock(b.id, e)} />
                  {b.id === 'affil' && <div style={{ height: 1, background: 'var(--border-faint)', margin: '6px 0' }} />}
                </React.Fragment>
              ))}
              <div style={{ marginTop: 10, textAlign: 'center', font: '11px/1 var(--font-serif)', color: 'var(--ink-300)' }}>1</div>
            </div>
          </div>
        </div>

        {reviewTask && (
          <ReviewOverlay task={reviewTask} blocks={blocksOf(reviewTask)}
            onClose={() => setReviewId(null)}
            onResolve={(v) => { setReviewId(null); onResolveTask(reviewTask.id, v); }} />
        )}
      </div>
    );
  }

  window.PdfPane = PdfPane;
})();
