/* Stanza UI kit — Sidebar (files + block outline + history) */
(function () {
  const I = window.Icons;

  function SectionLabel({ children, icon }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 6px', color: 'var(--ink-400)' }}>
        {icon}
        <span style={{ font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase' }}>{children}</span>
      </div>
    );
  }

  function Row({ icon, label, meta, active, indent = 0, accent, onClick }) {
    const [hover, setHover] = React.useState(false);
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 28, padding: `0 8px 0 ${8 + indent * 14}px`,
          borderRadius: 'var(--radius-sm)',
          background: active ? 'var(--clay-50)' : hover ? 'var(--hover-fill)' : 'transparent',
          color: active ? 'var(--clay-700)' : 'var(--ink-600)',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        {icon && <span style={{ flex: '0 0 auto', color: active ? 'var(--clay-500)' : accent || 'var(--ink-400)', display: 'inline-flex' }}>{icon}</span>}
        <span style={{ flex: 1, font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {meta && <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{meta}</span>}
      </div>
    );
  }

  function fileIcon(name) {
    const I = window.Icons;
    if (/\.bib$/.test(name)) return { icon: <I.List size={14} />, accent: 'var(--blue-500)' };
    if (/\.(png|jpe?g|svg)$/.test(name) || (/\.pdf$/.test(name))) return { icon: <I.Image size={14} />, accent: 'var(--ink-400)' };
    if (/\.(md|txt)$/.test(name)) return { icon: <I.PenLine size={14} /> };
    return { icon: <I.FileText size={14} /> };
  }

  function DirNode({ node, indent }) {
    const [open, setOpen] = React.useState(node.open ?? false);
    const I = window.Icons;
    return (
      <div>
        <Row indent={indent}
          icon={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {open ? <I.ChevronDown size={11} /> : <I.ChevronRight size={11} />}
              <I.Folder size={14} />
            </span>
          }
          label={node.dir} meta={open ? undefined : String(node.children.length)}
          onClick={() => setOpen((o) => !o)} />
        {open && node.children.map((c) => <FileNode key={c.path || c.dir} node={c} indent={indent + 1} />)}
      </div>
    );
  }

  function FileNode({ node, indent = 0 }) {
    if (node.dir) return <DirNode node={node} indent={indent} />;
    const name = node.path.split('/').pop();
    const { icon, accent } = fileIcon(name);
    return <Row indent={indent} icon={icon} label={name} active={node.active} accent={accent} />;
  }

  function Sidebar({ paper, activeBlock, onPickBlock }) {
    const outline = paper.blocks.filter((b) => b.kind === 'section' && !b.heading);
    return (
      <div style={{
        width: 'var(--rail-sidebar)', flex: '0 0 auto',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-app)',
        borderRight: '1px solid var(--border-default)'
      }}>
        {/* project header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px', borderBottom: '1px solid var(--border-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'var(--clay-500)', color: 'var(--text-on-accent)' }}>
            <I.Folder size={15} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: 'var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}>block-editing</div>
            <div style={{ font: 'var(--text-2xs)/1.2 var(--font-mono)', color: 'var(--ink-400)' }}>~/papers/block-editing</div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 8px' }}>
          <SectionLabel icon={<I.FileText size={12} />}>Files</SectionLabel>
          <div style={{ marginBottom: 18 }}>
            {paper.files.map((f) => <FileNode key={f.path || f.dir} node={f} />)}
          </div>

          <SectionLabel icon={<I.List size={12} />}>Outline</SectionLabel>
          <div style={{ marginBottom: 18 }}>
            {outline.map((b) => (
              <Row key={b.id} icon={<span style={{ font: 'var(--weight-semibold) 13px/1 var(--font-serif)' }}>§</span>}
                label={b.text} active={activeBlock === b.id}
                onClick={() => onPickBlock(b.id)} />
            ))}
          </div>

          <SectionLabel icon={<I.History size={12} />}>History</SectionLabel>
          <div>
            <Row icon={<I.Commit size={14} />} label="claude: tighten abstract" meta="2m" accent="var(--add-600)" />
            <Row icon={<I.Commit size={14} />} label="claude: define notation" meta="14m" accent="var(--add-600)" />
            <Row icon={<I.Commit size={14} />} label="wip: manual edits" meta="1h" />
          </div>
        </div>
      </div>
    );
  }

  window.Sidebar = Sidebar;
})();
