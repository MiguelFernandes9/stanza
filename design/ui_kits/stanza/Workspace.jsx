/* Stanza UI kit — Workspace: panes + the multi-task, block-anchored edit loop.
   Each block edit is a TASK with its own margin card (left of the page).
   Several tasks can run concurrently — compose / busy / review each shown
   on its own card, aligned to its block. Chat panel stays optional. */
(function () {
  const { TitleBar, Sidebar, PdfPane, ChatPane, SourceEditor } = window;
  const paper = window.STZ_PAPER;

  const proposalFor = (block) => {
    const p = paper.proposals[block.id] || paper.proposals.default;
    return { ...p, files: p.files.length ? [block.file] : p.files, note: p.note };
  };

  function Workspace({ onCloseDoc, preset = {} }) {
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
        <TitleBar title="block-editing" compile={compile} onCompile={recompile}
          onToggleSource={() => setSourceOpen((o) => !o)} sourceOpen={sourceOpen}
          onToggleChat={() => setChatOpen((o) => !o)} chatOpen={chatOpen}
          onCloseDoc={onCloseDoc} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Sidebar paper={paper} activeBlock={selected[0]} onPickBlock={(id) => { setView('select'); toggleBlock(id); }} />
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            {sourceOpen && <SourceEditor highlight={tasks.some((t) => t.phase === 'review')} onClose={() => setSourceOpen(false)} />}
            <PdfPane paper={paper} tasks={tasks} blocksOf={blocksOf}
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
