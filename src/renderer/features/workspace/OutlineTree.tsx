import { useState } from 'react'
import type { JSX } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BlockKind, BlockNode } from '@shared/blocks/types'

export interface OutlineNode {
  id: string
  label: string
  kind: BlockKind
  children: OutlineNode[]
}

/** A section's outline label: its title. BlockNodes the outline emits are always
 *  titled sections, so this is just the trimmed name (guarded for type safety). */
export function outlineLabel(node: BlockNode): string {
  return node.name?.trim() ?? ''
}

/** Filter the block tree to a structural table of contents: ONLY titled
 *  sections (`\chapter … \subparagraph`, all `kind: 'section'`). Preamble, plain
 *  paragraphs, and every environment (equations, figures, theorems) are dropped
 *  — the outline is navigation over document structure, not content. An untitled
 *  section emits no row but its children are PROMOTED into the parent level, so a
 *  titled descendant is never orphaned. One rule, no per-kind exceptions; nesting
 *  and order are preserved. Pure — unit-tested. */
export function buildOutline(roots: BlockNode[]): OutlineNode[] {
  const out: OutlineNode[] = []
  for (const node of roots) {
    if (node.kind !== 'section') continue
    const children = buildOutline(node.children)
    if (node.name && node.name.trim()) {
      out.push({ id: node.id, label: outlineLabel(node), kind: node.kind, children })
    } else {
      // Untitled section: drop the row, promote its (already-filtered) descendants.
      out.push(...children)
    }
  }
  return out
}

interface Props {
  blocks: BlockNode[]
  activeBlock: string | null
  onPick: (id: string) => void
}

/** Nested file outline: the titled-section tree, indented and collapsible. A
 *  structural table of contents — click a row to jump (never selects). */
export function OutlineTree({ blocks, activeBlock, onPick }: Props): JSX.Element {
  return (
    <div data-testid="outline-tree">
      {buildOutline(blocks).map((n) => (
        <OutlineRow key={n.id} node={n} depth={0} activeBlock={activeBlock} onPick={onPick} />
      ))}
    </div>
  )
}

function OutlineRow({
  node,
  depth,
  activeBlock,
  onPick
}: {
  node: OutlineNode
  depth: number
  activeBlock: string | null
  onPick: (id: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const [hover, setHover] = useState(false)
  const hasChildren = node.children.length > 0
  const isSection = node.kind === 'section'
  const active = activeBlock === node.id
  return (
    <div>
      <div
        onClick={() => onPick(node.id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 26,
          padding: `0 6px 0 ${6 + depth * 14}px`,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          userSelect: 'none',
          background: active ? 'var(--clay-50)' : hover ? 'var(--hover-fill)' : 'transparent',
          color: active ? 'var(--clay-700)' : isSection ? 'var(--ink-700)' : 'var(--ink-500)'
        }}
      >
        <span
          onClick={(e) => {
            if (!hasChildren) return
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          style={{ display: 'inline-flex', width: 12, flex: '0 0 auto', color: 'var(--ink-300)' }}
        >
          {hasChildren ? open ? <ChevronDown size={11} /> : <ChevronRight size={11} /> : null}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: `var(--weight-${isSection ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {node.label}
        </span>
      </div>
      {open &&
        node.children.map((c) => (
          <OutlineRow
            key={c.id}
            node={c}
            depth={depth + 1}
            activeBlock={activeBlock}
            onPick={onPick}
          />
        ))}
    </div>
  )
}
