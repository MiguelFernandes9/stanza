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

  /* Right-click menu — floats at the cursor, closes on outside click / Esc / scroll. */
  function ContextMenu({ x, y, items, onClose }) {
    const ref = React.useRef(null);
    const [pos, setPos] = React.useState({ left: x, top: y });
    React.useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      setPos({
        left: Math.min(x, window.innerWidth - r.width - pad),
        top: Math.min(y, window.innerHeight - r.height - pad)
      });
    }, [x, y]);
    React.useEffect(() => {
      const close = () => onClose();
      const key = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('mousedown', close);
      window.addEventListener('resize', close);
      window.addEventListener('blur', close);
      document.addEventListener('keydown', key);
      window.addEventListener('scroll', close, true);
      return () => {
        window.removeEventListener('mousedown', close);
        window.removeEventListener('resize', close);
        window.removeEventListener('blur', close);
        document.removeEventListener('keydown', key);
        window.removeEventListener('scroll', close, true);
      };
    }, []);
    return (
      <div
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 200, minWidth: 184,
          padding: 5, background: 'var(--surface-card)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)', animation: 'stz-fade-up 110ms var(--ease-out)'
        }}
      >
        {items.map((it, i) => it.sep ? (
          <div key={'s' + i} style={{ height: 1, background: 'var(--border-faint)', margin: '5px 6px' }} />
        ) : (
          <MenuItem key={it.label} item={it} onClose={onClose} />
        ))}
      </div>
    );
  }

  function MenuItem({ item, onClose }) {
    const [hover, setHover] = React.useState(false);
    const danger = item.danger;
    const fg = danger ? 'var(--del-600)' : 'var(--ink-700)';
    return (
      <button
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => { item.onClick(); onClose(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
          padding: '7px 9px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          background: hover ? (danger ? 'var(--del-bg)' : 'var(--hover-fill)') : 'transparent',
          color: fg, font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)'
        }}
      >
        <span style={{ flex: '0 0 auto', display: 'inline-flex', color: danger ? 'var(--del-600)' : 'var(--ink-400)' }}>{item.icon}</span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.kbd && <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{item.kbd}</span>}
      </button>
    );
  }

  function Row({ icon, label, meta, active, indent = 0, accent, onClick, onContextMenu, menuOpen, renaming, onRenameCommit, onRenameCancel }) {
    const [hover, setHover] = React.useState(false);
    const inputRef = React.useRef(null);
    React.useEffect(() => { if (renaming && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [renaming]);
    const highlight = active || menuOpen;
    return (
      <div
        onClick={renaming ? undefined : onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 28, padding: `0 8px 0 ${8 + indent * 14}px`,
          borderRadius: 'var(--radius-sm)',
          background: highlight ? 'var(--clay-50)' : hover ? 'var(--hover-fill)' : 'transparent',
          color: highlight ? 'var(--clay-700)' : 'var(--ink-600)',
          boxShadow: menuOpen ? 'inset 0 0 0 1px var(--clay-200)' : 'none',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        {icon && <span style={{ flex: '0 0 auto', color: highlight ? 'var(--clay-500)' : accent || 'var(--ink-400)', display: 'inline-flex' }}>{icon}</span>}
        {renaming ? (
          <input
            ref={inputRef}
            defaultValue={label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit(e.currentTarget.value);
              else if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={(e) => onRenameCommit(e.currentTarget.value)}
            style={{
              flex: 1, minWidth: 0, height: 20, padding: '0 5px', margin: 0,
              border: '1px solid var(--clay-400)', borderRadius: 'var(--radius-sm)',
              outline: 'none', background: 'var(--surface-card)', color: 'var(--ink-900)',
              font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)', boxShadow: '0 0 0 3px var(--clay-100)'
            }}
          />
        ) : (
          <span style={{ flex: 1, font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        )}
        {meta && !renaming && <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{meta}</span>}
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

  function DirNode({ node, indent, ctx }) {
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
          menuOpen={ctx.menuNode === node}
          renaming={ctx.renaming === node}
          onRenameCommit={(v) => ctx.commitRename(node, v)}
          onRenameCancel={ctx.cancelRename}
          onContextMenu={(e) => ctx.openMenu(e, node, 'dir')}
          onClick={() => setOpen((o) => !o)} />
        {open && node.children.map((c) => <FileNode key={c.path || c.dir} node={c} indent={indent + 1} ctx={ctx} />)}
      </div>
    );
  }

  function FileNode({ node, indent = 0, ctx }) {
    if (node.dir) return <DirNode node={node} indent={indent} ctx={ctx} />;
    const name = node.path.split('/').pop();
    const { icon, accent } = fileIcon(name);
    return (
      <Row indent={indent} icon={icon} label={name} active={ctx.activeFile === node.path} accent={accent}
        menuOpen={ctx.menuNode === node}
        renaming={ctx.renaming === node}
        onRenameCommit={(v) => ctx.commitRename(node, v)}
        onRenameCancel={ctx.cancelRename}
        onContextMenu={(e) => ctx.openMenu(e, node, 'file')}
        onClick={() => ctx.onOpenFile && ctx.onOpenFile(node.path)} />
    );
  }

  function Sidebar({ paper, files, activeFile, onOpenFile, onNewFile, onNewFolder, onCollapse, activeBlock, onPickBlock,
                     onRenameNode, onDuplicateNode, onDeleteNode }) {
    const outline = paper.blocks.filter((b) => b.kind === 'section' && !b.heading);
    const tree = files || paper.files;

    const [menu, setMenu] = React.useState(null);   // { x, y, node, kind }
    const [renaming, setRenaming] = React.useState(null); // node being renamed

    const openMenu = (e, node, kind) => {
      e.preventDefault();
      e.stopPropagation();
      setRenaming(null);
      setMenu({ x: e.clientX, y: e.clientY, node, kind });
    };
    const closeMenu = () => setMenu(null);
    const commitRename = (node, value) => {
      const v = (value || '').trim();
      const current = node.dir || node.path.split('/').pop();
      if (v && v !== current && onRenameNode) onRenameNode(node, v);
      setRenaming(null);
    };
    const cancelRename = () => setRenaming(null);

    const copyPath = (node) => {
      const p = node.dir || node.path;
      try { navigator.clipboard && navigator.clipboard.writeText(p); } catch (e) {}
    };

    const menuItems = (node, kind) => {
      if (kind === 'file') {
        return [
          { label: 'Open', icon: <I.CornerUpRight size={15} />, onClick: () => onOpenFile && onOpenFile(node.path) },
          { sep: true },
          { label: 'Rename', icon: <I.PenLine size={15} />, kbd: '⏎', onClick: () => { closeMenu(); setRenaming(node); } },
          { label: 'Duplicate', icon: <I.Copy size={15} />, onClick: () => onDuplicateNode && onDuplicateNode(node) },
          { label: 'Copy path', icon: <I.Link size={15} />, onClick: () => copyPath(node) },
          { sep: true },
          { label: 'Delete', icon: <I.Trash size={15} />, danger: true, onClick: () => onDeleteNode && onDeleteNode(node) }
        ];
      }
      return [
        { label: 'New file', icon: <I.Plus size={15} />, onClick: () => onNewFile && onNewFile(node) },
        { label: 'New folder', icon: <I.Folder size={15} />, onClick: () => onNewFolder && onNewFolder(node) },
        { sep: true },
        { label: 'Rename', icon: <I.PenLine size={15} />, kbd: '⏎', onClick: () => { closeMenu(); setRenaming(node); } },
        { label: 'Copy path', icon: <I.Link size={15} />, onClick: () => copyPath(node) },
        { sep: true },
        { label: 'Delete', icon: <I.Trash size={15} />, danger: true, onClick: () => onDeleteNode && onDeleteNode(node) }
      ];
    };

    const ctx = {
      activeFile, onOpenFile, openMenu,
      menuNode: menu && menu.node, renaming, commitRename, cancelRename
    };

    const addBtn = (label, icon, onClick) => (
      <button onClick={onClick} title={label} aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--ink-400)', cursor: 'pointer' }}>{icon}</button>
    );
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: 'var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}>{paper.project}</div>
            <div style={{ font: 'var(--text-2xs)/1.2 var(--font-mono)', color: 'var(--ink-400)' }}>~/papers/{paper.project}</div>
          </div>
          {onCollapse && (
            <button onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar" style={{ flex: '0 0 auto', width: 24, height: 24, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--ink-400)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><I.ChevronRight size={16} /></span>
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-400)', font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase' }}><I.FileText size={12} />Files</span>
            <span style={{ display: 'flex', gap: 2 }}>
              {addBtn('New file', <I.Plus size={13} />, () => onNewFile && onNewFile())}
              {addBtn('New folder', <I.Folder size={13} />, () => onNewFolder && onNewFolder())}
            </span>
          </div>
          <div style={{ marginBottom: 18 }}>
            {tree.map((f) => <FileNode key={f.path || f.dir} node={f} ctx={ctx} />)}
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

        {menu && (
          <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node, menu.kind)} onClose={closeMenu} />
        )}
      </div>
    );
  }

  window.Sidebar = Sidebar;
})();
