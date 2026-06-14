/* Stanza UI kit — PdfPaneTwoCol: two-column (NeurIPS/IEEE) paper preview.
   Same model as the single-column pane: the compiled A4 page is the hero,
   never restyled by selection. Each task is a state icon at the page edge
   (left-column → left edge, right-column → right edge); clicking opens its
   bubble in that side's rail with a connector. Selection is a pure overlay
   rectangle (contiguous same-task blocks merge into one). */
(function () {
  const { IconButton, SegmentedControl } = window.StanzaDesignSystem_d6c63d;
  const { TaskCard, ReviewOverlay, GLYPH } = window.StanzaPdfParts;
  const I = window.Icons;

  const PAGE_W = 648, PAGE_H = 916;   // two-column A4 (1 : √2)
  const PAD = 50, COLGAP = 26;
  const RAIL = 300, GAPX = 26;
  const MIN_ZOOM = 0.4, MAX_ZOOM = 1.6;

  function phaseTone(phase) {
    if (phase === 'review') return { accent: 'var(--add-600)', tint: 'var(--add-bg)', wash: 'rgba(60,138,93,0.13)', edge: 'rgba(60,138,93,0.5)' };
    if (phase === 'busy') return { accent: 'var(--clay-400)', tint: 'var(--clay-50)', wash: 'var(--select-fill)', edge: 'var(--select-edge)' };
    return { accent: 'var(--blue-500)', tint: 'var(--blue-50)', wash: 'rgba(61,110,156,0.10)', edge: 'rgba(61,110,156,0.45)' };
  }

  function TwoColBlock({ b, mark, hovered, onEnter, onLeave, onClick, refCb }) {
    const base = {
      position: 'relative', cursor: mark && mark.phase === 'busy' ? 'progress' : 'pointer',
      borderRadius: 'var(--radius-sm)',
      transition: 'background var(--dur-fast) var(--ease-out)',
      boxShadow: 'none', background: 'transparent'
    };
    const serif = 'var(--font-serif)';
    let inner = null;
    if (b.kind === 'title') {
      inner = <div style={{ font: `var(--weight-semibold) 23px/1.2 ${serif}`, color: 'var(--ink-900)', textAlign: 'center', letterSpacing: '-0.01em' }}>{b.text}</div>;
    } else if (b.kind === 'authors') {
      inner = <div style={{ font: `var(--weight-medium) 13px/1.4 ${serif}`, color: 'var(--ink-800)', textAlign: 'center' }}>{b.text}</div>;
    } else if (b.kind === 'affil') {
      inner = <div style={{ font: `italic var(--weight-regular) 11.5px/1.4 ${serif}`, color: 'var(--ink-500)', textAlign: 'center' }}>{b.text}</div>;
    } else if (b.kind === 'abshead') {
      inner = <div style={{ font: `var(--weight-semibold) 12px/1.3 ${serif}`, color: 'var(--ink-900)', textAlign: 'center' }}>{b.text}</div>;
    } else if (b.kind === 'abstract') {
      inner = <div style={{ font: `var(--weight-regular) 11.5px/1.55 ${serif}`, color: 'var(--ink-900)', textAlign: 'justify', padding: '0 30px' }}>{b.text}</div>;
    } else if (b.kind === 'section') {
      inner = <div style={{ font: `var(--weight-semibold) 12.5px/1.3 ${serif}`, color: 'var(--ink-900)' }}>{b.text}</div>;
    } else if (b.kind === 'equation') {
      inner = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '3px 0' }}>
          <span style={{ font: `italic var(--weight-regular) 12.5px/1.5 ${serif}`, color: 'var(--ink-900)' }}>{b.text}</span>
          <span style={{ font: `11px/1 ${serif}`, color: 'var(--ink-500)' }}>({b.num})</span>
        </div>
      );
    } else if (b.kind === 'figure') {
      inner = (
        <div>
          <div style={{ height: 78, borderRadius: 4, background: 'var(--surface-well)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'flex-end', gap: 3, padding: 8, marginBottom: 6 }}>
            {[34, 48, 30, 60, 26, 70].map((h, i) => (
              <div key={i} style={{ flex: 1, height: h + '%', borderRadius: 1, background: i % 2 ? 'var(--clay-400)' : 'var(--ink-300)' }} />
            ))}
          </div>
          <div style={{ font: `var(--weight-regular) 9.5px/1.45 ${serif}`, color: 'var(--ink-600)', textAlign: 'justify' }}>{b.text}</div>
        </div>
      );
    } else {
      inner = <div style={{ font: `var(--weight-regular) 10.5px/1.5 ${serif}`, color: 'var(--ink-900)', textAlign: 'justify' }}>{b.text}</div>;
    }
    return (
      <div ref={refCb} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}
        style={{ ...base, padding: '4px 9px', margin: '0 -9px' }}>
        {hovered && !mark && (
          <span style={{ position: 'absolute', top: -9, left: -1, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 4, height: 16, padding: '0 6px', background: 'var(--ink-700)', color: '#fff', borderRadius: 'var(--radius-pill)', font: 'var(--weight-semibold) 9px/1 var(--font-sans)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 10 }}>{GLYPH[b.kind] || '§'}</span>{`${b.file.split('/').pop()}:${b.span}`}
          </span>
        )}
        {inner}
      </div>
    );
  }

  function PdfPaneTwoCol({ paper, tasks, blocksOf, activeTask, onActivateTask, adding, onToggleAdding, onRemoveBlockFromTask, selected, onToggleBlock, view, onView, onUpdateTask, onSubmitTask, onDismissTask, onResolveTask }) {
    const [hover, setHover] = React.useState(null);
    const [reviewId, setReviewId] = React.useState(null);
    const [openIds, setOpenIds] = React.useState([]);
    const [zoom, setZoom] = React.useState(1);
    const [containerW, setContainerW] = React.useState(1100);
    const [pageNatH, setPageNatH] = React.useState(0);
    const [tops, setTops] = React.useState({});
    const [anchors, setAnchors] = React.useState({});
    const [selRects, setSelRects] = React.useState([]);
    const [fontsReady, setFontsReady] = React.useState(0);
    const reviewTask = tasks.find((t) => t.id === reviewId && t.phase === 'review');

    const scrollRef = React.useRef(null);
    const pageRef = React.useRef(null);
    const blockEls = React.useRef({});
    const cardEls = React.useRef({});
    const didFit = React.useRef(false);
    const autoOpened = React.useRef(new Set());

    const colOf = (id) => (paper.blocks.find((b) => b.id === id) || {}).col;
    const sides = {};
    let lc = 0, rc = 0;
    for (const t of tasks) { const c = colOf(t.blockIds[0]); if (c === 'l') { sides[t.id] = 'left'; lc++; } else if (c === 'r') { sides[t.id] = 'right'; rc++; } }
    for (const t of tasks) { if (sides[t.id]) continue; if (lc <= rc) { sides[t.id] = 'left'; lc++; } else { sides[t.id] = 'right'; rc++; } }

    const marks = {};
    for (const t of tasks) for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === activeTask, side: sides[t.id], taskId: t.id };

    React.useLayoutEffect(() => {
      const sc = scrollRef.current;
      if (!sc || typeof ResizeObserver === 'undefined') return;
      const measure = () => { setContainerW(sc.clientWidth); if (pageRef.current) setPageNatH(pageRef.current.offsetHeight); };
      if (!didFit.current) { didFit.current = true; setZoom(Math.max(MIN_ZOOM, Math.min(1, (sc.clientWidth - 2 * (RAIL + GAPX) - 40) / PAGE_W))); }
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(sc); if (pageRef.current) ro.observe(pageRef.current);
      return () => ro.disconnect();
    }, []);

    React.useLayoutEffect(() => {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => setFontsReady((n) => n + 1));
    }, []);

    React.useLayoutEffect(() => {
      const fresh = tasks.filter((t) => t.phase === 'compose' && !autoOpened.current.has(t.id));
      if (fresh.length) {
        fresh.forEach((c) => autoOpened.current.add(c.id));
        setOpenIds((s) => [...s, ...fresh.map((c) => c.id).filter((id) => !s.includes(id))]);
      }
    });

    // Stack open cards per side; record each block's y (anchor); build the
    // selection overlay rects (one per contiguous same-task run, column-aware).
    React.useLayoutEffect(() => {
      const anc = {};
      for (const t of tasks) { const el = blockEls.current[t.blockIds[0]]; anc[t.id] = el ? el.offsetTop * zoom : 0; }
      const next = {};
      for (const sideKey of ['left', 'right']) {
        const ideal = tasks.filter((t) => openIds.includes(t.id) && sides[t.id] === sideKey)
          .map((t) => ({ id: t.id, top: anc[t.id] })).sort((a, b) => a.top - b.top);
        let cursor = 0;
        for (const it of ideal) {
          const h = (cardEls.current[it.id] && cardEls.current[it.id].offsetHeight) || 90;
          const top = Math.max(it.top, cursor); next[it.id] = top; cursor = top + h + 14;
        }
      }
      const rects = []; let gi = 0;
      while (gi < paper.blocks.length) {
        const m0 = marks[paper.blocks[gi].id];
        if (m0) {
          let gj = gi, top = null, bottom = null, left = null, right = null;
          while (gj < paper.blocks.length && marks[paper.blocks[gj].id] && marks[paper.blocks[gj].id].taskId === m0.taskId) {
            const el = blockEls.current[paper.blocks[gj].id];
            if (el) {
              const t = el.offsetTop, bt = el.offsetTop + el.offsetHeight, l = el.offsetLeft, r = el.offsetLeft + el.offsetWidth;
              if (top === null || t < top) top = t; if (bottom === null || bt > bottom) bottom = bt;
              if (left === null || l < left) left = l; if (right === null || r > right) right = r;
            }
            gj++;
          }
          if (top !== null) rects.push({ key: m0.taskId + '@' + gi, taskId: m0.taskId, phase: m0.phase, active: m0.active, top, height: bottom - top, left, width: right - left });
          gi = gj;
        } else gi++;
      }
      setTops((p) => JSON.stringify(p) === JSON.stringify(next) ? p : next);
      setAnchors((p) => JSON.stringify(p) === JSON.stringify(anc) ? p : anc);
      setSelRects((p) => JSON.stringify(p) === JSON.stringify(rects) ? p : rects);
    }, [zoom, tasks, pageNatH, containerW, openIds, activeTask, fontsReady]);

    const zoomBy = (d) => setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + d).toFixed(2))));

    const pageW = PAGE_W * zoom, pageH = (pageNatH || PAGE_H) * zoom;
    const pageLeft = Math.max(RAIL + GAPX + 12, (containerW - pageW) / 2);
    const pageRightX = pageLeft + pageW;
    const leftRailRight = pageLeft - GAPX, leftRailLeft = leftRailRight - RAIL;
    const rightRailLeft = pageRightX + GAPX;
    const cW = Math.max(containerW, rightRailLeft + RAIL + 12);
    const contentH = Math.max(pageH + PAD * 2, 240);
    const hoveredTaskId = hover && marks[hover] ? marks[hover].taskId : null;

    const fullBlocks = paper.blocks.filter((b) => b.col === 'full');
    const leftBlocks = paper.blocks.filter((b) => b.col === 'l');
    const rightBlocks = paper.blocks.filter((b) => b.col === 'r');

    const renderBlock = (b) => (
      <TwoColBlock key={b.id} b={b} mark={marks[b.id] || null} hovered={view === 'select' && hover === b.id}
        refCb={(el) => { blockEls.current[b.id] = el; }}
        onEnter={() => setHover(b.id)} onLeave={() => setHover((h) => h === b.id ? null : h)}
        onClick={(e) => view === 'select' && onToggleBlock(b.id, e)} />
    );

    const cardHandlers = (t) => ({
      adding, onToggleAdding,
      onActivate: () => {},
      onDismiss: () => { onDismissTask(t.id); setOpenIds((s) => s.filter((x) => x !== t.id)); },
      onResolve: (v) => { onResolveTask(t.id, v); setOpenIds((s) => s.filter((x) => x !== t.id)); },
      onRemoveBlock: (bid) => onRemoveBlockFromTask(t.id, bid),
      onUpdate: (patch) => onUpdateTask(t.id, patch),
      onSubmit: () => onSubmitTask(t.id),
      onOpenReview: () => setReviewId(t.id)
    });

    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
        {/* pane toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 'var(--rail-toolbar)', flex: '0 0 auto', padding: '0 14px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-app)' }}>
          <span style={{ font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)', color: 'var(--ink-500)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase' }}>Preview</span>
          <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>main.pdf · 2-column</span>
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

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', background: 'var(--surface-canvas)' }}>
          <div style={{ position: 'relative', width: cW, height: contentH, minHeight: '100%' }}>
            {/* connector lines: one per open bubble, on its side */}
            <svg width={cW} height={contentH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
              {tasks.filter((t) => openIds.includes(t.id)).map((t) => {
                const tn = phaseTone(t.phase);
                const onRight = sides[t.id] === 'right';
                const by = PAD + (anchors[t.id] ?? 0) + 12;
                const cy = PAD + (tops[t.id] ?? 0) + 22;
                const x1 = onRight ? pageRightX : pageLeft;
                const x2 = onRight ? rightRailLeft : leftRailRight;
                const mx = (x1 + x2) / 2;
                return <path key={t.id} d={`M ${x1} ${by} C ${mx} ${by}, ${mx} ${cy}, ${x2} ${cy}`} fill="none" stroke={tn.accent} strokeWidth={2} opacity={0.7} />;
              })}
            </svg>

            {/* the compiled two-column page */}
            <div style={{ position: 'absolute', left: pageLeft, top: PAD, width: pageW, height: pageH }}>
              <div ref={pageRef} style={{
                width: PAGE_W, height: PAGE_H, transform: `scale(${zoom})`, transformOrigin: 'top left',
                background: '#fff', border: '1px solid var(--border-default)', borderRadius: 3,
                boxShadow: 'var(--shadow-page)', padding: `46px ${PAD}px 40px`, overflow: 'hidden', position: 'relative'
              }}>
                {/* selection overlay — never restyles the page itself */}
                {selRects.map((r) => {
                  const tn = phaseTone(r.phase);
                  const showPill = hoveredTaskId === r.taskId;
                  const ptxt = r.phase === 'busy' ? 'Claude editing — locked' : r.phase === 'review' ? 'Awaiting review' : 'Editing block';
                  return (
                    <React.Fragment key={r.key}>
                      <div style={{ position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: 'var(--radius-sm)', background: r.active ? tn.wash : tn.tint, boxShadow: r.active ? `inset 3px 0 0 ${tn.accent}, inset 0 0 0 1px ${tn.edge}` : `inset 3px 0 0 ${tn.accent}`, pointerEvents: 'none', zIndex: 0 }} />
                      {showPill && (
                        <span style={{ position: 'absolute', left: r.left + 2, top: r.top - 9, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 4, height: 16, padding: '0 6px', background: r.phase === 'busy' ? 'var(--ink-500)' : tn.accent, color: '#fff', borderRadius: 'var(--radius-pill)', font: 'var(--weight-semibold) 9px/1 var(--font-sans)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                          {r.phase !== 'compose' && <I.Lock size={9} />}{ptxt}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
                {view === 'select' && hover && !marks[hover] && blockEls.current[hover] && (
                  <div style={{ position: 'absolute', left: blockEls.current[hover].offsetLeft, top: blockEls.current[hover].offsetTop, width: blockEls.current[hover].offsetWidth, height: blockEls.current[hover].offsetHeight, borderRadius: 'var(--radius-sm)', background: 'var(--hover-fill)', boxShadow: 'inset 0 0 0 1px var(--hover-edge)', pointerEvents: 'none', zIndex: 0 }} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {fullBlocks.map(renderBlock)}
                </div>
                <div style={{ height: 1, background: 'var(--border-faint)', margin: '0 0 14px' }} />
                <div style={{ display: 'flex', gap: COLGAP, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>{leftBlocks.map(renderBlock)}</div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>{rightBlocks.map(renderBlock)}</div>
                </div>
                <div style={{ marginTop: 16, textAlign: 'center', font: '12px/1 var(--font-serif)', color: 'var(--ink-300)' }}>1</div>
              </div>
            </div>

            {/* state icons at the page edges — left-column on the left edge,
                right-column on the right edge; click toggles the bubble. */}
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              {tasks.map((t) => {
                const tn = phaseTone(t.phase);
                const onRight = sides[t.id] === 'right';
                const Icon = t.phase === 'review' ? I.Check : t.phase === 'busy' ? I.Sparkles : I.PenLine;
                const label = t.phase === 'review' ? 'Proposal ready' : t.phase === 'busy' ? 'Editing…' : 'Draft edit';
                const isOpen = openIds.includes(t.id);
                const x = (onRight ? pageRightX : pageLeft) - 13;
                return (
                  <button key={t.id} onClick={() => setOpenIds((s) => isOpen ? s.filter((y) => y !== t.id) : [...s, t.id])} aria-label={label}
                    title={`${label}${t.instruction ? ' — ' + t.instruction : ''}`}
                    style={{ position: 'absolute', left: x, top: PAD + (anchors[t.id] ?? 0), width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--paper-2)', padding: 0, background: tn.accent, color: '#fff', boxShadow: isOpen ? `0 0 0 3px ${tn.edge}, var(--shadow-md)` : 'var(--shadow-md)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: isOpen ? 'scale(1.08)' : 'none', transition: 'top var(--dur-base, 200ms) var(--ease-out)', zIndex: 6, animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none' }}>
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>

            {/* open bubbles, in their side's rail */}
            {tasks.filter((t) => openIds.includes(t.id)).map((t) => {
              const onRight = sides[t.id] === 'right';
              return (
                <div key={t.id} ref={(el) => { cardEls.current[t.id] = el; }}
                  style={{ position: 'absolute', left: onRight ? rightRailLeft : leftRailLeft, top: PAD + (tops[t.id] ?? 0), width: RAIL, zIndex: 7, transition: 'top var(--dur-base, 200ms) var(--ease-out)' }}>
                  <TaskCard task={t} blocks={blocksOf(t)} side={sides[t.id]} expanded {...cardHandlers(t)} />
                </div>
              );
            })}
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

  window.PdfPaneTwoCol = PdfPaneTwoCol;
})();
