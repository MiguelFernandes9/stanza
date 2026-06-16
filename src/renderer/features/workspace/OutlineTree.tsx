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

/** A short outline label: the rendered figure/equation number when one is known
 *  ("Figure 1", "Equation 2" — keyed by block id in `numbers`), else a section
 *  or named environment by its name, else a kind fallback (BlockNode carries no
 *  prose, so plain paragraphs have none — buildOutline drops those). */
export function outlineLabel(node: BlockNode, numbers?: Map<string, string>): string {
  const rendered = numbers?.get(node.id)
  if (rendered) return rendered
  if (node.name && node.name.trim()) return node.name
  return node.kind === 'section' ? 'Untitled section' : node.kind
}

/** Filter the block tree to the outline: every section (kept and recursed)
 *  and every NAMED leaf (figures, equations, labeled environments). Preamble
 *  and unnamed plain paragraphs are dropped; nesting and order are preserved.
 *  `numbers` (block id → rendered "Figure 1") drives the label. Pure — unit-tested. */
export function buildOutline(roots: BlockNode[], numbers?: Map<string, string>): OutlineNode[] {
  const out: OutlineNode[] = []
  for (const node of roots) {
    if (node.kind === 'preamble') continue
    if (node.kind === 'section' || node.name) {
      out.push({
        id: node.id,
        label: outlineLabel(node, numbers),
        kind: node.kind,
        children: buildOutline(node.children, numbers)
      })
    }
  }
  return out
}

interface Props {
  blocks: BlockNode[]
  activeBlock: string | null
  onPick: (id: string) => void
  /** Rendered figure/equation numbers by block id (Part B). */
  numbers?: Map<string, string>
}

/** Nested file outline (v0.4): the full section/named-leaf tree, indented and
 *  collapsible. Replaces the top-level-only OUTLINE list. */
export function OutlineTree({ blocks, activeBlock, onPick, numbers }: Props): JSX.Element {
  return (
    <div>
      {buildOutline(blocks, numbers).map((n) => (
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
