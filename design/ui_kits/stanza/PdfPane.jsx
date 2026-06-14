/* Stanza UI kit — PdfPane: rendered paper with addressable blocks + the
   left margin rail. Each edit task is a card in the margin, vertically
   aligned with its block (collision-stacked), so parallel Claude tasks
   are each visible: compose → busy → review, in place. */
(function () {
  const { IconButton, SegmentedControl, Button, BlockTag, DiffHunk, Kbd } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  const GLYPH = { section: '§', paragraph: '¶', equation: '∑', figure: '❏', table: '▦', citation: '†', title: '§' };
  const PAGE_W = 576;        // A4 proportion (1 : √2)
  const PAGE_H = 815;
  const GAP = 16;            // gap between a bubble and the page edge
  const FULL_W = 224;        // left-margin width that fits a full bubble
  const CHIP_W = 116;        // ...that fits a compact chip (else: pin)
  const MIN_ZOOM = 0.4, MAX_ZOOM = 1.6;

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

  // Per-state color: blue = draft · clay = editing · green = proposal ready.
  function phaseTone(phase) {
    if (phase === 'review') return { accent: 'var(--add-600)', tint: 'var(--add-bg)', wash: 'rgba(60,138,93,0.13)', edge: 'rgba(60,138,93,0.5)' };
    if (phase === 'busy') return { accent: 'var(--clay-400)', tint: 'var(--clay-50)', wash: 'var(--select-fill)', edge: 'var(--select-edge)' };
    return { accent: 'var(--blue-500)', tint: 'var(--blue-50)', wash: 'rgba(61,110,156,0.10)', edge: 'rgba(61,110,156,0.45)' };
  }

  function Block({ b, mark, hovered, onEnter, onLeave, onClick, refCb }) {
    const locked = mark && (mark.phase === 'busy' || mark.phase === 'review');
    const base = {
      position: 'relative', cursor: mark && mark.phase === 'busy' ? 'progress' : 'pointer',
      borderRadius: 'var(--radius-sm)',
      transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      boxShadow: 'none',
      background: 'transparent'
    };

    let inner = null;
    const serif = 'var(--font-serif)';
    if (b.kind === 'title') {
      inner = <div style={{ font: `var(--weight-semibold) 20px/1.18 ${serif}`, color: 'var(--ink-900)', textAlign: 'center', letterSpacing: '-0.01em' }}>{b.text}</div>;
    } else if (b.kind === 'section' && b.heading) {
      inner = <div style={{ font: `var(--weight-semibold) 12.5px/1.3 ${serif}`, color: 'var(--ink-900)', textAlign: 'center' }}>{b.text}</div>;
    } else if (b.kind === 'section') {
      inner = <div style={{ font: `var(--weight-semibold) 14px/1.3 ${serif}`, color: 'var(--ink-900)' }}>{b.text}</div>;
    } else if (b.kind === 'equation') {
      inner = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '4px 0' }}>
          <span style={{ font: `italic var(--weight-regular) 13.5px/1.5 ${serif}`, color: 'var(--ink-900)' }}
            dangerouslySetInnerHTML={{ __html: b.text.replace(/\\mathcal\{B\}/g, '\u212C').replace(/\\textsf\{(\w+)\}/g, '<span style="font-style:normal">$1</span>').replace(/\\longmapsto/g, '\u27FC').replace(/\\,|\\;/g, ' ').replace(/\\ell/g, '\u2113') }} />
          <span style={{ font: `13px/1 ${serif}`, color: 'var(--ink-500)' }}>({b.num})</span>
        </div>
      );
    } else {
      const indent = (b.id === 's1-p1' || b.id === 's2-p1') ? '1.4em' : '0';
      inner = <div style={{ font: `var(--weight-regular) 12px/1.5 ${serif}`, color: b.id === 'affil' ? 'var(--ink-500)' : 'var(--ink-900)', textAlign: b.id === 'authors' || b.id === 'affil' ? 'center' : 'justify', textIndent: indent, fontStyle: b.id === 'affil' ? 'italic' : 'normal' }}>{b.text}</div>;
    }

    return (
      <div ref={refCb} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}
        style={{ ...base, padding: '5px 10px', margin: '0 -10px' }}>
        {hovered && !mark && (
          <span style={{
            position: 'absolute', top: -9, left: -1, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 17, padding: '0 6px',
            background: 'var(--ink-700)',
            color: '#fff', borderRadius: 'var(--radius-pill)',
            font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)', letterSpacing: '0.02em',
            boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', whiteSpace: 'nowrap'
          }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 11 }}>{GLYPH[b.kind] || '§'}</span>
            {`${b.file.split('/').pop()}:${b.span}`}
          </span>
        )}
        {inner}
      </div>
    );
  }

  // One margin card = one Claude task. Only the ACTIVE task expands; the
  // rest collapse to one-line chips so a crowded rail stays scannable.
  function TaskCard({ task, blocks, expanded, adding, side = 'left', onToggleAdding, onRemoveBlock, onActivate, onUpdate, onSubmit, onDismiss, onResolve, onOpenReview, refCb }) {
    const conn = side === 'right' ? { left: -GAP } : { right: -GAP };
    const taRef = React.useRef(null);
    React.useEffect(() => { if (expanded && task.phase === 'compose' && taRef.current) taRef.current.focus(); }, [task.phase, expanded]);
    const phaseColor = task.phase === 'review' ? 'var(--clay-500)' : task.phase === 'busy' ? 'var(--clay-400)' : 'var(--line-ink)';
    // distinct icon per state: ✎ draft · ✦ editing · ✓ proposal ready
    const PhaseIcon = task.phase === 'review' ? I.Check : task.phase === 'busy' ? I.Sparkles : I.PenLine;
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px', overflow: 'hidden',
            background: task.phase === 'review' ? 'var(--clay-50)' : 'var(--surface-overlay)',
            border: `1px solid ${task.phase === 'review' ? 'var(--clay-200)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)'
          }}>
            {task.phase === 'busy'
              ? <span style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%', background: 'var(--clay-400)', animation: 'stz-pulse 1s var(--ease-in-out) infinite' }} />
              : <PhaseIcon size={12} style={{ color: phaseColor, flex: '0 0 auto' }} />}
            <span style={{ flex: '0 0 auto', font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)', color: task.phase === 'review' ? 'var(--clay-700)' : 'var(--ink-600)', whiteSpace: 'nowrap' }}>
              {task.phase === 'review' ? 'Proposal ready' : task.phase === 'busy' ? 'Editing…' : 'Draft edit'}
            </span>
            <span style={{ flex: 1, minWidth: 0, font: 'var(--text-2xs)/1.3 var(--font-mono)', color: 'var(--ink-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: task.instruction ? 'italic' : 'normal' }}>
              {task.instruction ? `“${task.instruction}”` : spanRef}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div ref={refCb} style={{ position: 'relative' }}>
        <div style={{
          background: 'var(--surface-overlay)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
          padding: 10, animation: 'stz-fade-up 180ms var(--ease-out)'
        }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <PhaseIcon size={13} style={{ color: phaseColor, flex: '0 0 auto' }} />
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

          {task.phase === 'review' && (() => {
            const ls = (task.proposal.diff || '').split('\n');
            let a = 0, d = 0;
            for (const l of ls) { if (l[0] === '+' && l[1] !== '+') a++; else if (l[0] === '-' && l[1] !== '-') d++; }
            return (
              <div>
                <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', margin: '0 1px 9px' }}>{task.proposal.note}</div>
                <button onClick={onOpenReview} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)',
                  background: 'var(--surface-card)', marginBottom: 10
                }}>
                  <I.FileText size={13} style={{ color: 'var(--ink-400)', flex: '0 0 auto' }} />
                  <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.proposal.files[0]}</span>
                  <span style={{ display: 'inline-flex', gap: 7, marginLeft: 'auto', flex: '0 0 auto' }}>
                    <span style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)', color: 'var(--add-600)' }}>+{a}</span>
                    <span style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)', color: 'var(--del-600)' }}>−{d}</span>
                  </span>
                  <I.Maximize size={12} style={{ color: 'var(--ink-400)', flex: '0 0 auto' }} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Button size="sm" variant="primary" iconLeft={<I.Check size={13} />} onClick={() => onResolve('accept')}>Accept</Button>
                  <Button size="sm" variant="secondary" iconLeft={<I.X size={13} />} onClick={() => onResolve('reject')}>Reject</Button>
                  <div style={{ flex: 1 }} />
                  <IconButton size="sm" label="Open full review" onClick={onOpenReview}><I.Maximize size={14} /></IconButton>
                </div>
              </div>
            );
          })()}
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
    const [openIds, setOpenIds] = React.useState([]);
    const [zoom, setZoom] = React.useState(1);
    const [containerW, setContainerW] = React.useState(900);
    const [pageNatH, setPageNatH] = React.useState(0);
    const [tops, setTops] = React.useState({});
    const [anchors, setAnchors] = React.useState({});
    const [selRects, setSelRects] = React.useState([]);
    const [fontsReady, setFontsReady] = React.useState(0);
    const reviewTask = tasks.find((t) => t.id === reviewId && t.phase === 'review');
    const marks = {};
    for (const t of tasks) for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === activeTask, taskId: t.id };

    const scrollRef = React.useRef(null);
    const pageRef = React.useRef(null);
    const blockEls = React.useRef({});
    const cardEls = React.useRef({});
    const didFit = React.useRef(false);
    const autoOpened = React.useRef(new Set());

    const RAIL = 326, GAPX = 30, PAD = 28;

    React.useLayoutEffect(() => {
      const sc = scrollRef.current;
      if (!sc || typeof ResizeObserver === 'undefined') return;
      const measure = () => {
        setContainerW(sc.clientWidth);
        if (pageRef.current) setPageNatH(pageRef.current.offsetHeight);
      };
      if (!didFit.current) {
        didFit.current = true;
        const z = Math.max(MIN_ZOOM, Math.min(1, (sc.clientWidth - RAIL - GAPX - PAD * 2 - 40) / PAGE_W));
        setZoom(z);
      }
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(sc);
      if (pageRef.current) ro.observe(pageRef.current);
      return () => ro.disconnect();
    }, []);

    // Stack cards in the rail, aligned to their blocks; keep each block's own
    // y (anchor) for the connector line.
    // Stack only the OPEN cards (collision); keep every block's y (anchor) for
    // icon placement and connector starts.
    React.useLayoutEffect(() => {
      const anc = {};
      for (const t of tasks) {
        const el = blockEls.current[t.blockIds[0]];
        anc[t.id] = el ? el.offsetTop * zoom : 0;
      }
      const ideal = tasks.filter((t) => openIds.includes(t.id))
        .map((t) => ({ id: t.id, top: anc[t.id] }))
        .sort((a, b) => a.top - b.top);
      let cursor = 0; const next = {};
      for (const it of ideal) {
        const h = (cardEls.current[it.id] && cardEls.current[it.id].offsetHeight) || 90;
        const top = Math.max(it.top, cursor);
        next[it.id] = top; cursor = top + h + 14;
      }
      setTops((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      setAnchors((prev) => JSON.stringify(prev) === JSON.stringify(anc) ? prev : anc);

      // Selection overlay rects: one per contiguous run of same-task blocks,
      // measured from the live block positions so the PDF itself never changes.
      const rects = []; let gi = 0;
      while (gi < paper.blocks.length) {
        const m0 = marks[paper.blocks[gi].id];
        if (m0) {
          let gj = gi, top = null, bottom = null;
          while (gj < paper.blocks.length && marks[paper.blocks[gj].id] && marks[paper.blocks[gj].id].taskId === m0.taskId) {
            const el = blockEls.current[paper.blocks[gj].id];
            if (el) { const t = el.offsetTop, bt = el.offsetTop + el.offsetHeight; if (top === null || t < top) top = t; if (bottom === null || bt > bottom) bottom = bt; }
            gj++;
          }
          if (top !== null) rects.push({ key: m0.taskId + '@' + gi, taskId: m0.taskId, phase: m0.phase, active: m0.active, top, height: bottom - top });
          gi = gj;
        } else gi++;
      }
      setSelRects((prev) => JSON.stringify(prev) === JSON.stringify(rects) ? prev : rects);
    }, [zoom, tasks, pageNatH, containerW, openIds, activeTask, fontsReady]);

    // The page has a fixed height, so its ResizeObserver never fires when the
    // webfont swaps in and the blocks reflow — re-measure once fonts are ready.
    React.useLayoutEffect(() => {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setFontsReady((n) => n + 1));
      }
    }, []);

    const zoomBy = (d) => setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + d).toFixed(2))));

    // A draft (compose) opens ONCE on creation so it's editable; after that the
    // user can freely collapse it.
    React.useLayoutEffect(() => {
      const fresh = tasks.filter((t) => t.phase === 'compose' && !autoOpened.current.has(t.id));
      if (fresh.length) {
        fresh.forEach((c) => autoOpened.current.add(c.id));
        setOpenIds((s) => [...s, ...fresh.map((c) => c.id).filter((id) => !s.includes(id))]);
      }
    });

    // Consistent at every zoom: each task is a clear icon badge pinned to the

    const pageW = PAGE_W * zoom, pageH = (pageNatH || PAGE_H) * zoom;
    const pageLeft = Math.max(PAD, (containerW - pageW) / 2);   // centered in the pane
    const pageRightX = pageLeft + pageW;
    const railLeft = pageRightX + GAPX;
    const cW = Math.max(containerW, railLeft + RAIL + PAD);
    const contentH = Math.max(pageH + PAD * 2, 240);

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
            <IconButton size="sm" label="Zoom out" onClick={() => zoomBy(-0.1)}><I.ZoomOut size={15} /></IconButton>
            <div style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', width: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</div>
            <IconButton size="sm" label="Zoom in" onClick={() => zoomBy(0.1)}><I.ZoomIn size={15} /></IconButton>
          </div>
        </div>

        {/* the compiled page is the hero; a right rail lists every task, each
            linked to its block by a connector line. */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', background: 'var(--surface-canvas)' }}>
          <div style={{ position: 'relative', width: cW, height: contentH, minHeight: '100%' }}>
            {/* connector lines: one per open bubble */}
            <svg width={cW} height={contentH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
              {tasks.filter((t) => openIds.includes(t.id)).map((t) => {
                const tn = phaseTone(t.phase);
                const by = PAD + (anchors[t.id] ?? 0) + 12;
                const cy = PAD + (tops[t.id] ?? 0) + 22;
                const mx = pageRightX + (railLeft - pageRightX) / 2;
                return <path key={t.id} d={`M ${pageRightX} ${by} C ${mx} ${by}, ${mx} ${cy}, ${railLeft} ${cy}`} fill="none" stroke={tn.accent} strokeWidth={2} opacity={0.7} />;
              })}
            </svg>

            {/* the page */}
            <div style={{ position: 'absolute', left: pageLeft, top: PAD, width: pageW, height: pageH }}>
              <div ref={pageRef} style={{
                width: PAGE_W, height: PAGE_H, transform: `scale(${zoom})`, transformOrigin: 'top left',
                background: '#fff', border: '1px solid var(--border-default)', borderRadius: 3,
                boxShadow: 'var(--shadow-page)', padding: '46px 52px 40px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', gap: 8, position: 'relative'
              }}>
                {/* selection overlay — sits behind the text; the page itself is
                    never restyled, so selecting never reflows the document. */}
                {selRects.map((r) => {
                  const tn = phaseTone(r.phase);
                  const showPill = hover && marks[hover] && marks[hover].taskId === r.taskId;
                  const ptxt = r.phase === 'busy' ? 'Claude editing — locked' : r.phase === 'review' ? 'Awaiting review' : 'Editing block';
                  return (
                    <React.Fragment key={r.key}>
                      <div style={{ position: 'absolute', left: 42, right: 42, top: r.top, height: r.height, borderRadius: 'var(--radius-sm)', background: r.active ? tn.wash : tn.tint, boxShadow: r.active ? `inset 3px 0 0 ${tn.accent}, inset 0 0 0 1px ${tn.edge}` : `inset 3px 0 0 ${tn.accent}`, pointerEvents: 'none', zIndex: 0 }} />
                      {showPill && (
                        <span style={{ position: 'absolute', left: 44, top: r.top - 9, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 4, height: 17, padding: '0 6px', background: r.phase === 'busy' ? 'var(--ink-500)' : tn.accent, color: '#fff', borderRadius: 'var(--radius-pill)', font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                          {r.phase !== 'compose' && <I.Lock size={10} />}{ptxt}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
                {view === 'select' && hover && !marks[hover] && blockEls.current[hover] && (
                  <div style={{ position: 'absolute', left: 42, right: 42, top: blockEls.current[hover].offsetTop, height: blockEls.current[hover].offsetHeight, borderRadius: 'var(--radius-sm)', background: 'var(--hover-fill)', boxShadow: 'inset 0 0 0 1px var(--hover-edge)', pointerEvents: 'none', zIndex: 0 }} />
                )}
                {paper.blocks.map((b) => (
                  <React.Fragment key={b.id}>
                    <Block b={b} mark={marks[b.id] || null} hovered={view === 'select' && hover === b.id}
                      refCb={(el) => { blockEls.current[b.id] = el; }}
                      onEnter={() => setHover(b.id)} onLeave={() => setHover((h) => h === b.id ? null : h)}
                      onClick={(e) => view === 'select' && onToggleBlock(b.id, e)} />
                    {b.id === 'affil' && <div style={{ height: 1, background: 'var(--border-faint)', margin: '6px 0' }} />}
                  </React.Fragment>
                ))}
                <div style={{ flex: 1, minHeight: 24 }} />
                <div style={{ textAlign: 'center', font: '12px/1 var(--font-serif)', color: 'var(--ink-300)' }}>1</div>
              </div>
            </div>

            {/* state icons at the page's right edge — always visible, click to
                open that task's bubble (keeps the paper uncluttered). */}
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              {tasks.map((t) => {
                const tn = phaseTone(t.phase);
                const Icon = t.phase === 'review' ? I.Check : t.phase === 'busy' ? I.Sparkles : I.PenLine;
                const label = t.phase === 'review' ? 'Proposal ready' : t.phase === 'busy' ? 'Editing…' : 'Draft edit';
                const isOpen = openIds.includes(t.id);
                return (
                  <button key={t.id} onClick={() => setOpenIds((s) => isOpen ? s.filter((x) => x !== t.id) : [...s, t.id])} aria-label={label}
                    title={`${label}${t.instruction ? ' — ' + t.instruction : ''}`}
                    style={{ position: 'absolute', left: pageRightX - 13, top: PAD + (anchors[t.id] ?? 0), width: 28, height: 28, borderRadius: '50%',
                      border: '2px solid var(--paper-2)', padding: 0, background: tn.accent, color: '#fff',
                      boxShadow: isOpen ? `0 0 0 3px ${tn.edge}, var(--shadow-md)` : 'var(--shadow-md)', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: isOpen ? 'scale(1.08)' : 'none',
                      transition: 'top var(--dur-base, 200ms) var(--ease-out)', zIndex: 6,
                      animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none' }}>
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>

            {/* open bubbles, each aligned to its icon (stacked if they collide) */}
            {tasks.filter((t) => openIds.includes(t.id)).map((t) => (
              <div key={t.id} ref={(el) => { cardEls.current[t.id] = el; }}
                style={{ position: 'absolute', left: railLeft, top: PAD + (tops[t.id] ?? 0), width: RAIL, zIndex: 7, transition: 'top var(--dur-base, 200ms) var(--ease-out)' }}>
                <TaskCard task={t} blocks={blocksOf(t)} expanded
                  onActivate={() => {}}
                  onDismiss={() => { onDismissTask(t.id); setOpenIds((s) => s.filter((x) => x !== t.id)); }}
                  onResolve={(v) => { onResolveTask(t.id, v); setOpenIds((s) => s.filter((x) => x !== t.id)); }}
                  adding={adding} onToggleAdding={onToggleAdding}
                  onRemoveBlock={(bid) => onRemoveBlockFromTask(t.id, bid)}
                  onUpdate={(patch) => onUpdateTask(t.id, patch)}
                  onSubmit={() => onSubmitTask(t.id)}
                  onOpenReview={() => setReviewId(t.id)} />
              </div>
            ))}
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
  // Shared parts reused by the two-column pane.
  window.StanzaPdfParts = { Block, TaskCard, ReviewOverlay, blockLabel, combineSpan, GLYPH };
})();
