import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  GitCommitHorizontal,
  History,
  Image,
  List,
  PenLine
} from 'lucide-react'
import type { BlockNode } from '@shared/blocks/types'
import type { CommitInfo, DocumentInfo, FileEntry } from '@shared/ipc'
import { buildFileTree, relativeTime } from './sidebarData'
import type { FileTreeNode } from './sidebarData'

interface Props {
  doc: DocumentInfo
  files: FileEntry[]
  blocks: BlockNode[]
  history: CommitInfo[]
  activeBlock: string | null
  onPickBlock: (id: string) => void
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
}

function Row({ icon, label, meta, active = false, indent = 0, accent, onClick }: RowProps): JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 28,
        padding: `0 8px 0 ${8 + indent * 14}px`,
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--clay-50)' : hover ? 'var(--hover-fill)' : 'transparent',
        color: active ? 'var(--clay-700)' : 'var(--ink-600)',
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      {icon && (
        <span
          style={{
            flex: '0 0 auto',
            color: active ? 'var(--clay-500)' : accent ?? 'var(--ink-400)',
            display: 'inline-flex'
          }}
        >
          {icon}
        </span>
      )}
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
      {meta && <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{meta}</span>}
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

function TreeNode({
  node,
  indent,
  mainFile
}: {
  node: FileTreeNode
  indent: number
  mainFile: string
}): JSX.Element {
  const [open, setOpen] = useState(indent === 0)
  if ('entry' in node) {
    const name = node.entry.relPath.split('/').pop() ?? node.entry.relPath
    const { icon, accent } = fileIcon(node.entry)
    return <Row indent={indent} icon={icon} label={name} accent={accent} active={node.entry.relPath === mainFile} />
  }
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
        label={node.dir.split('/').pop() ?? node.dir}
        meta={open ? undefined : String(node.children.length)}
        onClick={() => setOpen((o) => !o)}
      />
      {open &&
        node.children.map((c) => (
          <TreeNode key={'entry' in c ? c.entry.relPath : c.dir} node={c} indent={indent + 1} mainFile={mainFile} />
        ))}
    </div>
  )
}

/** Sidebar — design §2: project header, FILES tree, OUTLINE, HISTORY. */
export function Sidebar({ doc, files, blocks, history, activeBlock, onPickBlock }: Props): JSX.Element {
  const tree = buildFileTree(files)
  const outline = blocks.filter((b) => b.kind === 'section')
  const projectName = doc.root.split('/').pop() ?? doc.root

  return (
    <div
      style={{
        width: 'var(--rail-sidebar)',
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
        <SectionLabel icon={<FileText size={12} />}>Files</SectionLabel>
        <div style={{ marginBottom: 18 }}>
          {tree.map((n) => (
            <TreeNode key={'entry' in n ? n.entry.relPath : n.dir} node={n} indent={0} mainFile={doc.mainFile} />
          ))}
        </div>

        <SectionLabel icon={<List size={12} />}>Outline</SectionLabel>
        <div style={{ marginBottom: 18 }}>
          {outline.map((b) => (
            <Row
              key={b.id}
              icon={<span style={{ font: 'var(--weight-semibold) 13px/1 var(--font-serif)' }}>§</span>}
              label={b.name ?? 'Untitled section'}
              active={activeBlock === b.id}
              onClick={() => onPickBlock(b.id)}
            />
          ))}
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
    </div>
  )
}
