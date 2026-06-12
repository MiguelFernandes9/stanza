/* Stanza UI kit — ChatPane: instruction input, message stream, inline proposal */
(function () {
  const { Button, IconButton, Avatar, Badge, BlockTag, DiffHunk, StatusDot, Kbd } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  function Proposal({ proposal, onAccept, onReject, resolved }) {
    if (resolved) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '6px 11px', borderRadius: 'var(--radius-pill)',
          background: resolved === 'accept' ? 'var(--add-bg)' : 'var(--del-bg)',
          border: `1px solid ${resolved === 'accept' ? 'var(--add-line)' : 'var(--del-line)'}` }}>
          <span style={{ color: resolved === 'accept' ? 'var(--add-600)' : 'var(--del-600)', display: 'inline-flex' }}>
            {resolved === 'accept' ? <I.Commit size={13} /> : <I.Undo size={13} />}
          </span>
          <span style={{ font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)', color: resolved === 'accept' ? 'var(--add-700)' : 'var(--del-700)' }}>
            {resolved === 'accept' ? 'Accepted · committed to intro.tex' : 'Rejected · restored'}
          </span>
        </div>
      );
    }
    return (
      <div style={{ marginTop: 11 }}>
        <DiffHunk file={proposal.files[0]} diff={proposal.diff} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Button size="sm" variant="primary" iconLeft={<I.Check size={14} />} onClick={onAccept}>Accept</Button>
          <Button size="sm" variant="secondary" iconLeft={<I.X size={14} />} onClick={onReject}>Reject</Button>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Kbd>⌘</Kbd><Kbd>↵</Kbd>
          </span>
        </div>
      </div>
    );
  }

  function Message({ m, onAccept, onReject }) {
    const isUser = m.role === 'user';
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {isUser ? <Avatar name="Miguel Fernandes" size={26} /> : <Avatar claude size={26} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-800)' }}>{isUser ? 'You' : 'Claude'}</span>
            {m.blocks && m.blocks.map((b) => (
              <span key={b.id} style={{ font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-mono)', color: 'var(--clay-600)', background: 'var(--clay-50)', padding: '2px 6px', borderRadius: 'var(--radius-pill)' }}>
                §{' '}{b.file.split('/').pop()}:{b.span}
              </span>
            ))}
          </div>
          <div style={{ font: `var(--weight-regular) var(--text-base)/1.5 var(--font-sans)`, color: isUser ? 'var(--ink-900)' : 'var(--ink-600)' }}>{m.text}</div>
          {m.proposal && <Proposal proposal={m.proposal} resolved={m.resolved} onAccept={onAccept} onReject={onReject} />}
        </div>
      </div>
    );
  }

  function ChatPane({ messages, busy, selectedBlocks, instruction, setInstruction, onRemoveBlock, onSubmit, onAccept, onReject }) {
    const streamRef = React.useRef(null);
    React.useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [messages.length, busy]);

    return (
      <div style={{ width: 428, flex: '0 0 auto', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', borderLeft: '1px solid var(--border-default)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 'var(--rail-toolbar)', flex: '0 0 auto', padding: '0 14px', borderBottom: '1px solid var(--border-default)' }}>
          <I.Sparkles size={16} style={{ color: 'var(--clay-500)' }} />
          <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>Assistant</span>
          <div style={{ flex: 1 }} />
          <StatusDot tone={busy ? 'busy' : 'ok'} pulse={busy} label={busy ? 'Editing…' : 'Session ready'} />
        </div>

        {/* message stream */}
        <div ref={streamRef} style={{ flex: 1, overflow: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((m, i) => <Message key={i} m={m} onAccept={onAccept} onReject={onReject} />)}
          {busy && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Avatar claude size={26} />
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map((n) => <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clay-400)', animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite` }} />)}
              </span>
            </div>
          )}
        </div>

        {/* composer */}
        <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border-default)', padding: 12, background: 'var(--surface-app)' }}>
          {selectedBlocks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
              {selectedBlocks.map((b) => (
                <BlockTag key={b.id} kind={b.kind === 'title' ? 'section' : b.kind} label={blockLabel(b)} span={`${b.file.split('/').pop()}:${b.span}`} active onRemove={() => onRemoveBlock(b.id)} />
              ))}
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'var(--surface-card)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)', padding: '8px 8px 8px 12px', boxShadow: 'var(--shadow-inset)'
          }}>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); } }}
              rows={1}
              placeholder={selectedBlocks.length ? 'Instruct Claude for the selected block…' : 'Select a block in the page, then type an instruction…'}
              style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', font: 'var(--weight-regular) var(--text-base)/1.45 var(--font-sans)', color: 'var(--ink-900)', maxHeight: 96, padding: '5px 0' }}
            />
            <Button size="sm" variant="primary" disabled={!instruction.trim() || busy} onClick={onSubmit}
              style={{ padding: '0 10px' }} iconLeft={<I.ArrowUp size={15} />}>Run</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, paddingLeft: 2 }}>
            <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>Claude Code edits the <span style={{ fontFamily: 'var(--font-mono)' }}>.tex</span> source directly · </span>
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Kbd>⌘</Kbd><Kbd>↵</Kbd></span>
            <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>to run</span>
          </div>
        </div>
      </div>
    );
  }

  function blockLabel(b) {
    if (b.kind === 'section') return b.text.replace(/^\d+\s+/, '');
    if (b.kind === 'equation') return `eq (${b.num})`;
    if (b.kind === 'title') return 'Title';
    const map = { 's1-p1': 'Opening paragraph', 'abstract': 'Abstract', 's1-p2': 'Paragraph', 's2-p1': 'Paragraph', authors: 'Authors', affil: 'Affiliation' };
    return map[b.id] || 'Paragraph';
  }

  window.ChatPane = ChatPane;
})();
