/* Stanza UI kit — Workspace: panes + the multi-task, block-anchored edit loop.
   Each block edit is a TASK with its own margin card (left of the page).
   Several tasks can run concurrently — compose / busy / review each shown
   on its own card, aligned to its block. Chat panel stays optional. */
(function () {
  const { TitleBar, Sidebar, ChatPane, SourceEditor } = window;
  const I = window.Icons;

  function Workspace({ onCloseDoc, preset = {}, paper: paperProp, Pane }) {
    const paper = paperProp || window.STZ_PAPER;
    const PdfPaneC = Pane || window.PdfPane;

    const proposalFor = (block) => {
      const p = paper.proposals[block.id] || paper.proposals.default;
      return { ...p, files: p.files.length ? [block.file] : p.files, note: p.note };
    };

    const idRef = React.useRef(100);
    const [tasks, setTasks] = React.useState(preset.tasks || [
      { id: 1, blockIds: ['s1-p1'], instruction: 'Tighten this and add a forward reference to the method.', phase: 'compose', proposal: null }
    ]);
    const [view, setView] = React.useState(preset.view || 'select');
    const [sourceOpen, setSourceOpen] = React.useState(preset.sourceOpen ?? false);
    const [chatOpen, setChatOpen] = React.useState(preset.chatOpen ?? false);
    const [instruction, setInstruction] = React.useState(''); // chat composer only
    const [compile, setCompile] = React.useState({ state: 'ok', errors: 0, warnings: 0 });
    const [messages, setMessages] = React.useState(preset.messages || [
      { role: 'claude', text: 'Document primed — 11 blocks across 4 files. Click a block in the page to start an edit; several can run at once.' }
    ]);

    const [activeTask, setActiveTask] = React.useState(preset.activeTask ?? (preset.tasks ? preset.tasks[0].id : 1));
    const [files, setFiles] = React.useState(() => JSON.parse(JSON.stringify(paper.files)));
    const [openFiles, setOpenFiles] = React.useState([paper.mainFile || 'main.tex']);
    const [activeFile, setActiveFile] = React.useState(paper.mainFile || 'main.tex');
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const [sourceW, setSourceW] = React.useState(520);
    const splitRef = React.useRef(null);
    const startDrag = (e) => {
      e.preventDefault();
      const move = (ev) => {
        const r = splitRef.current && splitRef.current.getBoundingClientRect();
        if (r) setSourceW(Math.max(300, Math.min(r.width - 360, ev.clientX - r.left)));
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); document.body.style.cursor = 'col-resize';
    };
    const newRef = React.useRef(0);
    const openFile = (path) => { setOpenFiles((o) => o.includes(path) ? o : [...o, path]); setActiveFile(path); setSourceOpen(true); };
    const closeTab = (path) => setOpenFiles((o) => {
      const n = o.filter((x) => x !== path);
      setActiveFile((a) => a === path ? (n[n.length - 1] || null) : a);
      if (!n.length) setSourceOpen(false);
      return n;
    });
    const newFile = (dir) => {
      const base = `untitled-${++newRef.current}.tex`;
      if (dir && dir.dir) {
        const p = dir.dir + '/' + base;
        setFiles((fs) => mapNode(fs, dir, (n) => [{ ...n, open: true, children: [...n.children, { path: p }] }]));
        openFile(p);
        return;
      }
      setFiles((fs) => [...fs, { path: base }]); openFile(base);
    };
    const newFolder = (dir) => {
      const name = `new-folder-${++newRef.current}`;
      if (dir && dir.dir) {
        setFiles((fs) => mapNode(fs, dir, (n) => [{ ...n, open: true, children: [...n.children, { dir: dir.dir + '/' + name, open: true, children: [] }] }]));
        return;
      }
      setFiles((fs) => [...fs, { dir: name, open: true, children: [] }]);
    };

    // ── file-tree edits (right-click menu) ──────────────────────────────
    const renameInPath = (full, name) => { const i = full.lastIndexOf('/'); return i >= 0 ? full.slice(0, i + 1) + name : name; };
    const dupPath = (full) => {
      const slash = full.lastIndexOf('/');
      const dir = slash >= 0 ? full.slice(0, slash + 1) : '';
      const base = slash >= 0 ? full.slice(slash + 1) : full;
      const dot = base.lastIndexOf('.');
      return dot > 0 ? `${dir}${base.slice(0, dot)} copy${base.slice(dot)}` : `${dir}${base} copy`;
    };
    // recursively rebuild the tree, applying `op` to the matched node
    const mapNode = (nodes, target, op) => nodes.flatMap((n) => {
      if (n === target) return op(n);
      if (n.children) return [{ ...n, children: mapNode(n.children, target, op) }];
      return [n];
    });

    const renameNode = (node, name) => {
      if (node.dir) {
        const slash = node.dir.lastIndexOf('/');
        const newDir = (slash >= 0 ? node.dir.slice(0, slash + 1) : '') + name;
        const oldPrefix = node.dir + '/';
        const fixPath = (p) => p.startsWith(oldPrefix) ? newDir + '/' + p.slice(oldPrefix.length) : p;
        const rewrite = (nodes) => nodes.map((c) => c.dir ? { ...c, dir: fixPath(c.dir + '/').slice(0, -1), children: rewrite(c.children) } : { ...c, path: fixPath(c.path) });
        setFiles((fs) => mapNode(fs, node, (n) => [{ ...n, dir: newDir, children: rewrite(n.children) }]));
        setOpenFiles((o) => o.map(fixPath));
        setActiveFile((a) => a ? fixPath(a) : a);
        return;
      }
      const next = renameInPath(node.path, name);
      setFiles((fs) => mapNode(fs, node, (n) => [{ ...n, path: next }]));
      setOpenFiles((o) => o.map((p) => p === node.path ? next : p));
      setActiveFile((a) => a === node.path ? next : a);
    };

    const duplicateNode = (node) => {
      if (node.dir) return;
      const next = dupPath(node.path);
      setFiles((fs) => mapNode(fs, node, (n) => [n, { ...n, path: next, active: false }]));
    };

    const deleteNode = (node) => {
      setFiles((fs) => mapNode(fs, node, () => []));
      const gather = (n) => n.dir ? n.children.flatMap(gather) : [n.path];
      gather(node).forEach((p) => closeTab(p));
    };
    const selected = tasks.flatMap((t) => t.blockIds);
    const busy = tasks.some((t) => t.phase === 'busy');
    const blocksOf = (t) => t.blockIds.map((id) => paper.blocks.find((b) => b.id === id)).filter(Boolean);

    const updateTask = (id, patch) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, ...patch } : t));
    const removeTask = (id) => setTasks((ts) => {
      const next = ts.filter((t) => t.id !== id);
      setActiveTask((a) => a === id ? (next.length ? next[next.length - 1].id : null) : a);
      return next;
    });

    const [adding, setAdding] = React.useState(false); // "+ blocks" mode: plain clicks append to the active draft

    // Clicking a section heading claims the WHOLE section.
    const expandIds = (blockId) => {
      const b = paper.blocks.find((x) => x.id === blockId);
      if (b && b.kind === 'section' && b.sec) return paper.blocks.filter((x) => x.sec === b.sec).map((x) => x.id);
      return [blockId];
    };

    const toggleBlock = (blockId, additive = false) => {
      const ids = expandIds(blockId);
      const owner = tasks.find((t) => t.blockIds.some((x) => ids.includes(x)));
      const active = tasks.find((t) => t.id === activeTask);

      // Additive (⇧/⌘-click or "+ blocks" mode): grow/shrink the active draft.
      if (additive && active && active.phase === 'compose') {
        if (owner && owner.id !== active.id) { setActiveTask(owner.id); return; } // claimed by another task
        const inTask = ids.every((id) => active.blockIds.includes(id));
        const next = inTask
          ? active.blockIds.filter((x) => !ids.includes(x))
          : [...active.blockIds, ...ids.filter((id) => !active.blockIds.includes(id))];
        next.length ? updateTask(active.id, { blockIds: next }) : removeTask(active.id);
        return;
      }

      if (owner) {
        // Locked while the agent works (busy) or a verdict is pending (review):
        // clicking only focuses the owning task's card.
        if (owner.phase === 'compose' && owner.id === activeTask && ids.every((id) => owner.blockIds.includes(id))) {
          const rest = owner.blockIds.filter((x) => !ids.includes(x));
          rest.length ? updateTask(owner.id, { blockIds: rest }) : removeTask(owner.id);
        } else {
          setActiveTask(owner.id);
        }
        return;
      }
      const nid = ++idRef.current;
      setTasks((ts) => [...ts, { id: nid, blockIds: ids, instruction: '', phase: 'compose', proposal: null }]);
      setActiveTask(nid);
      setAdding(false);
    };

    const removeBlockFromTask = (taskId, blockId) => {
      const t = tasks.find((x) => x.id === taskId);
      if (!t || t.phase !== 'compose') return;
      const rest = t.blockIds.filter((x) => x !== blockId);
      rest.length ? updateTask(taskId, { blockIds: rest }) : removeTask(taskId);
    };

    const submitTask = (id) => {
      const t = tasks.find((x) => x.id === id);
      if (!t || !t.instruction.trim() || t.phase !== 'compose') return;
      const blocks = blocksOf(t).map((b) => ({ id: b.id, file: b.file, span: b.span }));
      setMessages((m) => [...m, { role: 'user', text: t.instruction.trim(), blocks }]);
      updateTask(id, { phase: 'busy' });
      setAdding(false);
      const target = blocksOf(t)[0];
      setTimeout(() => {
        const proposal = proposalFor(target);
        updateTask(id, { phase: 'review', proposal });
        setActiveTask(id); // surface the finished proposal
        setMessages((m) => [...m, { role: 'claude', text: proposal.note, proposal, resolved: null, taskId: id }]);
      }, 1400 + Math.random() * 1200);
    };

    const resolveTask = (id, verdict) => {
      setMessages((m) => m.map((msg) => msg.taskId === id && msg.proposal && !msg.resolved ? { ...msg, resolved: verdict } : msg));
      if (verdict === 'accept') {
        setCompile({ state: 'running', errors: 0, warnings: 0 });
        setTimeout(() => setCompile({ state: 'ok', errors: 0, warnings: 0 }), 1300);
      }
      removeTask(id);
    };

    // Chat-side handlers (optional panel): act on the newest relevant task.
    const chatSubmit = () => {
      if (!instruction.trim()) return;
      const compose = tasks.filter((t) => t.phase === 'compose').slice(-1)[0];
      if (!compose) return;
      updateTask(compose.id, { instruction: instruction.trim() });
      setInstruction('');
      setTimeout(() => submitTask(compose.id), 0);
    };
    const latestReview = tasks.filter((t) => t.phase === 'review').slice(-1)[0];

    const recompile = () => {
      setCompile({ state: 'running', errors: 0, warnings: 0 });
      setTimeout(() => setCompile({ state: 'ok', errors: 0, warnings: 0 }), 1100);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-app)' }}>
        <TitleBar title={paper.project} compile={compile} onCompile={recompile}
          onToggleSource={() => setSourceOpen((o) => !o)} sourceOpen={sourceOpen}
          onToggleChat={() => setChatOpen((o) => !o)} chatOpen={chatOpen}
          onCloseDoc={onCloseDoc} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {sidebarOpen ? (
            <Sidebar paper={paper} files={files} activeFile={activeFile}
              onOpenFile={openFile} onNewFile={newFile} onNewFolder={newFolder}
              onRenameNode={renameNode} onDuplicateNode={duplicateNode} onDeleteNode={deleteNode}
              onCollapse={() => setSidebarOpen(false)}
              activeBlock={selected[0]} onPickBlock={(id) => { setView('select'); toggleBlock(id); }} />
          ) : (
            <div style={{ width: 36, flex: '0 0 auto', borderRight: '1px solid var(--border-default)', background: 'var(--surface-app)', display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
              <button onClick={() => setSidebarOpen(true)} title="Show files" aria-label="Show files" style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--ink-500)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I.ChevronRight size={16} /></button>
            </div>
          )}
          <div ref={splitRef} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            {sourceOpen && (
              <React.Fragment>
                <div style={{ width: sourceW, flex: '0 0 auto', display: 'flex', minWidth: 0 }}>
                  <SourceEditor openFiles={openFiles} active={activeFile} onSelect={setActiveFile} onCloseTab={closeTab} highlight={tasks.some((t) => t.phase === 'review')} onClose={() => setSourceOpen(false)} />
                </div>
                <div onMouseDown={startDrag} title="Drag to resize" style={{ width: 7, flex: '0 0 auto', cursor: 'col-resize', background: 'var(--border-default)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 2, height: 28, borderRadius: 2, background: 'var(--line-ink)' }} />
                </div>
              </React.Fragment>
            )}
            <PdfPaneC paper={paper} tasks={tasks} blocksOf={blocksOf}
              activeTask={activeTask} onActivateTask={setActiveTask}
              adding={adding} onToggleAdding={() => setAdding((a) => !a)}
              onRemoveBlockFromTask={removeBlockFromTask}
              selected={selected}
              onToggleBlock={(id, e) => toggleBlock(id, adding || !!(e && (e.shiftKey || e.metaKey || e.ctrlKey)))}
              view={view} onView={setView}
              onUpdateTask={updateTask} onSubmitTask={submitTask}
              onDismissTask={(id) => { removeTask(id); setAdding(false); }} onResolveTask={resolveTask} />
          </div>
          {chatOpen && (
            <ChatPane messages={messages} busy={busy}
              selectedBlocks={tasks.filter((t) => t.phase === 'compose').flatMap(blocksOf)}
              instruction={instruction} setInstruction={setInstruction}
              onRemoveBlock={toggleBlock} onSubmit={chatSubmit}
              onAccept={() => latestReview && resolveTask(latestReview.id, 'accept')}
              onReject={() => latestReview && resolveTask(latestReview.id, 'reject')} />
          )}
        </div>
      </div>
    );
  }

  window.Workspace = Workspace;
})();
