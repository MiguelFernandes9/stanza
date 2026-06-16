import { useEffect, useRef, useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  Copy,
  FileText,
  Folder,
  GitCommitHorizontal,
  History,
  Image,
  Link,
  List,
  PenLine,
  Plus,
  Trash2,
  Upload
} from 'lucide-react'
import type { BlockNode } from '@shared/blocks/types'
import type { CommitInfo, DocumentInfo, FileEntry } from '@shared/ipc'
import { buildFileTree, relativeTime } from './sidebarData'
import type { FileTreeNode } from './sidebarData'
import { composeSiblingPath, menuItemsForKind } from './fileMenu'
import type { FileMenuId, FileMenuKind } from './fileMenu'
import { FileContextMenu } from './FileContextMenu'
import type { ContextMenuEntry } from './FileContextMenu'
import { OutlineTree } from './OutlineTree'
import { useFileDrag } from './fileDrag'
import type { FileDrag } from './fileDrag'

interface Props {
  doc: DocumentInfo
  /** Sidebar width (px) — drag-resizable via usePaneWidths. */
  width: number
  files: FileEntry[]
  blocks: BlockNode[]
  history: CommitInfo[]
  /** Rendered figure/equation numbers by block id, shown in the outline (Part B). */
  outlineNumbers?: Map<string, string>
  activeBlock: string | null
  onPickBlock: (id: string) => void
  // v0.2 file management — actions live in Workspace (like onPickBlock); the
  // menu/inline-rename UI state stays local to this component.
  onOpenFile: (relPath: string) => void
  onRename: (relPath: string, toRelPath: string) => void
  onDuplicate: (relPath: string) => void
  onDelete: (relPath: string) => void
  onCreateFile: (dir: string) => void
  onCreateFolder: (dir: string) => void
  /** Upload files into a dir ('' = root) — main shows the OS picker (v0.4). */
  onUpload: (dir: string) => void
  /** Drag-drop move: relocate `from` into folder `toDir` ('' = root) — a
   *  cross-dir rename (git mv). Workspace guards + applies it (v0.4). */
  onMove: (from: string, toDir: string) => void
  /** Files whose Rename/Delete must be blocked — a busy/review task owns a
   *  block in them (UI mirror of the backend span lock). */
  lockedFiles: Set<string>
  /** A path Workspace just created and wants renamed inline (type-the-name). */
  renameOnAppear?: string | null
  onRenameHandled?: () => void
}

/** A folder is locked when any file inside it is locked — a folder rename or
 *  delete would move/strand that in-flight edit. */
function dirLocked(locked: Set<string>, dir: string): boolean {
  for (const f of locked) {
    if (f === dir || f.startsWith(`${dir}/`)) return true
  }
  return false
}

const MENU_ICON: Record<FileMenuId, ReactNode> = {
  open: <CornerUpRight size={15} />,
  rename: <PenLine size={15} />,
  duplicate: <Copy size={15} />,
  copyPath: <Link size={15} />,
  delete: <Trash2 size={15} />,
  newFile: <Plus size={15} />,
  newFolder: <Folder size={15} />,
  upload: <Upload size={15} />
}

function SectionLabel({ children, icon }: { children: ReactNode; icon: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 6px', color: 'var(--ink-400)' }}>
      {icon}
      <span
        style={{
          font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase'
        }}
      >
        {children}
      </span>
    </div>
  )
}

interface RowProps {
  icon?: ReactNode
  label: ReactNode
  meta?: string
  active?: boolean
  indent?: number
  accent?: string
  onClick?: () => void
  onContextMenu?: (e: ReactMouseEvent) => void
  menuOpen?: boolean
  renaming?: boolean
  /** Seed value for the inline-rename input (the current basename). */
  renameValue?: string
  onRenameCommit?: (value: string) => void
  onRenameCancel?: () => void
  /** Drag source / drop target wiring (v0.4 drag-move) spread onto the row. */
  dragProps?: ReturnType<FileDrag['sourceProps']>
  dropProps?: ReturnType<FileDrag['targetProps']>
  dropActive?: boolean
}

function Row({
  icon,
  label,
  meta,
  active = false,
  indent = 0,
  accent,
  onClick,
  onContextMenu,
  menuOpen = false,
  renaming = false,
  renameValue,
  onRenameCommit,
  onRenameCancel,
  dragProps,
  dropProps,
  dropActive = false
}: RowProps): JSX.Element {
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])
  const highlight = active || menuOpen
  return (
    <div
      {...dragProps}
      {...dropProps}
      onClick={renaming ? undefined : onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 28,
        padding: `0 8px 0 ${8 + indent * 14}px`,
        borderRadius: 'var(--radius-sm)',
        background: dropActive
          ? 'var(--clay-50)'
          : highlight
            ? 'var(--clay-50)'
            : hover
              ? 'var(--hover-fill)'
              : 'transparent',
        color: highlight ? 'var(--clay-700)' : 'var(--ink-600)',
        boxShadow: dropActive
          ? 'inset 0 0 0 2px var(--clay-400)'
          : menuOpen
            ? 'inset 0 0 0 1px var(--clay-200)'
            : 'none',
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      {icon && (
        <span
          style={{
            flex: '0 0 auto',
            color: highlight ? 'var(--clay-500)' : accent ?? 'var(--ink-400)',
            display: 'inline-flex'
          }}
        >
          {icon}
        </span>
      )}
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={renameValue}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit?.(e.currentTarget.value)
            else if (e.key === 'Escape') {
              e.stopPropagation()
              onRenameCancel?.()
            }
          }}
          // Spec: blur cancels (the mock commits on blur — deliberately not
          // mirrored, so clicking away never renames by accident).
          onBlur={() => onRenameCancel?.()}
          style={{
            flex: 1,
            minWidth: 0,
            height: 20,
            padding: '0 5px',
            margin: 0,
            border: '1px solid var(--clay-400)',
            borderRadius: 'var(--radius-sm)',
            outline: 'none',
            background: 'var(--surface-card)',
            color: 'var(--ink-900)',
            font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)',
            boxShadow: '0 0 0 3px var(--clay-100)'
          }}
        />
      ) : (
        <span
          style={{
            flex: 1,
            font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {label}
        </span>
      )}
      {meta && !renaming && (
        <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{meta}</span>
      )}
    </div>
  )
}

function fileIcon(entry: FileEntry): { icon: ReactNode; accent?: string } {
  switch (entry.kind) {
    case 'bib':
      return { icon: <List size={14} />, accent: 'var(--blue-500)' }
    case 'image':
      return { icon: <Image size={14} /> }
    case 'text':
      return { icon: <PenLine size={14} /> }
    default:
      return { icon: <FileText size={14} /> }
  }
}

/** Handlers + transient UI state threaded down the recursive tree. */
interface TreeCtx {
  mainFile: string
  lockedFiles: Set<string>
  menuPath: string | null
  renaming: string | null
  forceOpen: Set<string>
  openMenu: (e: ReactMouseEvent, path: string, kind: FileMenuKind, locked: boolean) => void
  commitRename: (path: string, value: string) => void
  cancelRename: () => void
  onFileClick: (relPath: string) => void
  drag: FileDrag
}

function TreeNode({ node, indent, ctx }: { node: FileTreeNode; indent: number; ctx: TreeCtx }): JSX.Element {
  if ('entry' in node) {
    const relPath = node.entry.relPath
    const name = relPath.split('/').pop() ?? relPath
    const { icon, accent } = fileIcon(node.entry)
    return (
      <Row
        indent={indent}
        icon={icon}
        label={name}
        accent={accent}
        active={relPath === ctx.mainFile}
        menuOpen={ctx.menuPath === relPath}
        renaming={ctx.renaming === relPath}
        renameValue={name}
        onRenameCommit={(v) => ctx.commitRename(relPath, v)}
        onRenameCancel={ctx.cancelRename}
        onContextMenu={(e) => ctx.openMenu(e, relPath, 'file', ctx.lockedFiles.has(relPath))}
        onClick={() => ctx.onFileClick(relPath)}
        dragProps={ctx.drag.sourceProps(relPath)}
      />
    )
  }
  return <DirNode node={node} indent={indent} ctx={ctx} />
}

function DirNode({
  node,
  indent,
  ctx
}: {
  node: { dir: string; children: FileTreeNode[] }
  indent: number
  ctx: TreeCtx
}): JSX.Element {
  const [open, setOpen] = useState(indent === 0)
  // A New file/folder inside this dir auto-expands it.
  useEffect(() => {
    if (ctx.forceOpen.has(node.dir)) setOpen(true)
  }, [ctx.forceOpen, node.dir])
  const name = node.dir.split('/').pop() ?? node.dir
  const locked = dirLocked(ctx.lockedFiles, node.dir)
  return (
    <div>
      <Row
        indent={indent}
        icon={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Folder size={14} />
          </span>
        }
        label={name}
        meta={open ? undefined : String(node.children.length)}
        menuOpen={ctx.menuPath === node.dir}
        renaming={ctx.renaming === node.dir}
        renameValue={name}
        onRenameCommit={(v) => ctx.commitRename(node.dir, v)}
        onRenameCancel={ctx.cancelRename}
        onContextMenu={(e) => ctx.openMenu(e, node.dir, 'dir', locked)}
        onClick={() => setOpen((o) => !o)}
        dragProps={ctx.drag.sourceProps(node.dir)}
        dropProps={ctx.drag.targetProps(node.dir)}
        dropActive={ctx.drag.overDir === node.dir}
      />
      {open &&
        node.children.map((c) => (
          <TreeNode key={'entry' in c ? c.entry.relPath : c.dir} node={c} indent={indent + 1} ctx={ctx} />
        ))}
    </div>
  )
}

interface MenuState {
  x: number
  y: number
  path: string
  kind: FileMenuKind
  locked: boolean
}

/** Sidebar — design §2: project header, FILES tree (with v0.2 file management),
 *  OUTLINE, HISTORY. */
export function Sidebar({
  doc,
  width,
  files,
  blocks,
  history,
  outlineNumbers,
  activeBlock,
  onPickBlock,
  onOpenFile,
  onRename,
  onDuplicate,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onUpload,
  onMove,
  lockedFiles,
  renameOnAppear,
  onRenameHandled
}: Props): JSX.Element {
  const tree = buildFileTree(files)
  const projectName = doc.root.split('/').pop() ?? doc.root
  const drag = useFileDrag(onMove)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [forceOpen, setForceOpen] = useState<Set<string>>(new Set())

  // Workspace created a file and asked for the type-the-name inline rename.
  useEffect(() => {
    if (renameOnAppear) {
      setRenaming(renameOnAppear)
      onRenameHandled?.()
    }
  }, [renameOnAppear, onRenameHandled])

  const openMenu = (e: ReactMouseEvent, path: string, kind: FileMenuKind, locked: boolean): void => {
    e.preventDefault()
    e.stopPropagation()
    setRenaming(null)
    setMenu({ x: e.clientX, y: e.clientY, path, kind, locked })
  }
  const closeMenu = (): void => setMenu(null)

  const commitRename = (path: string, value: string): void => {
    setRenaming(null)
    const next = value.trim()
    const current = path.split('/').pop() ?? path
    if (!next || next === current) return
    onRename(path, composeSiblingPath(path, next))
  }
  const cancelRename = (): void => setRenaming(null)

  const itemAction = (id: FileMenuId, path: string): void => {
    switch (id) {
      case 'open':
        onOpenFile(path)
        break
      case 'rename':
        setRenaming(path)
        break
      case 'duplicate':
        onDuplicate(path)
        break
      case 'copyPath':
        void navigator.clipboard?.writeText(path)
        break
      case 'delete':
        onDelete(path)
        break
      case 'newFile':
        setForceOpen((s) => new Set(s).add(path))
        onCreateFile(path)
        break
      case 'newFolder':
        setForceOpen((s) => new Set(s).add(path))
        onCreateFolder(path)
        break
      case 'upload':
        setForceOpen((s) => new Set(s).add(path))
        onUpload(path)
        break
    }
  }

  const buildMenuItems = (path: string, kind: FileMenuKind, locked: boolean): ContextMenuEntry[] =>
    menuItemsForKind(kind, { locked }).map((e): ContextMenuEntry =>
      'sep' in e
        ? e
        : {
            label: e.label,
            icon: MENU_ICON[e.id],
            kbd: e.kbd,
            danger: e.danger,
            disabled: e.disabled,
            onSelect: () => itemAction(e.id, path)
          }
    )

  const ctx: TreeCtx = {
    mainFile: doc.mainFile,
    lockedFiles,
    menuPath: menu?.path ?? null,
    renaming,
    forceOpen,
    openMenu,
    commitRename,
    cancelRename,
    onFileClick: onOpenFile,
    drag
  }

  const addBtn = (label: string, icon: ReactNode, onClick: () => void): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-400)',
        cursor: 'pointer'
      }}
    >
      {icon}
    </button>
  )

  return (
    <div
      style={{
        width,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-app)',
        borderRight: '1px solid var(--border-default)'
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px', borderBottom: '1px solid var(--border-faint)' }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--clay-500)',
            color: 'var(--text-on-accent)'
          }}
        >
          <Folder size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: 'var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}>
            {projectName}
          </div>
          <div
            style={{
              font: 'var(--text-2xs)/1.2 var(--font-mono)',
              color: 'var(--ink-400)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {doc.root}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 6px' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--ink-400)',
              font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase'
            }}
          >
            <FileText size={12} />
            Files
          </span>
          <span style={{ display: 'flex', gap: 2 }}>
            {addBtn('New file', <Plus size={13} />, () => onCreateFile(''))}
            {addBtn('New folder', <Folder size={13} />, () => onCreateFolder(''))}
            {addBtn('Upload', <Upload size={13} />, () => onUpload(''))}
          </span>
        </div>
        <div
          {...drag.targetProps('')}
          style={{
            marginBottom: 18,
            borderRadius: 'var(--radius-sm)',
            boxShadow: drag.overDir === '' ? 'inset 0 0 0 2px var(--clay-400)' : 'none'
          }}
        >
          {tree.map((n) => (
            <TreeNode key={'entry' in n ? n.entry.relPath : n.dir} node={n} indent={0} ctx={ctx} />
          ))}
        </div>

        <SectionLabel icon={<List size={12} />}>Outline</SectionLabel>
        <div style={{ marginBottom: 18 }}>
          <OutlineTree blocks={blocks} activeBlock={activeBlock} onPick={onPickBlock} numbers={outlineNumbers} />
        </div>

        <SectionLabel icon={<History size={12} />}>History</SectionLabel>
        <div>
          {history.map((c) => (
            <Row
              key={`${c.iso}-${c.subject}`}
              icon={<GitCommitHorizontal size={14} />}
              label={c.subject}
              meta={relativeTime(c.iso)}
              accent={c.kind === 'claude' ? 'var(--add-600)' : undefined}
            />
          ))}
        </div>
      </div>

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.path, menu.kind, menu.locked)}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
