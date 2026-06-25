import { client } from '@renderer/lib/client'
import { attachmentKind, isAcceptedAttachment } from '@shared/ipc'
import type { Attachment, PickedAttachment } from '@shared/ipc'

/** Convert files (picker / paste / drag) into Attachments the composer can stage.
 *  Picked files keep their bytes on disk (srcPath); pasted/dropped files are read
 *  inline as data URLs. Images get a small chip thumbnail. */

let counter = 0
const newId = (): string => `att-${Date.now().toString(36)}-${(counter++).toString(36)}`

/** A usable filename for an arbitrary File: its own name when accepted, else a
 *  synthesized one for a pasted image (clipboard images often arrive nameless).
 *  Returns null when the file isn't an accepted type. */
function resolveName(file: File): string | null {
  if (file.name && isAcceptedAttachment(file.name)) return file.name
  if (file.type.startsWith('image/')) {
    const ext = (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
    return `pasted-image.${ext}`
  }
  return null
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Downscale an image data URL to a ≤48px-tall chip thumbnail; on any canvas
 *  failure fall back to the original data URL. */
async function thumbnail(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl)
    const h = Math.min(48, img.height || 48)
    const w = img.width && img.height ? Math.round((img.width / img.height) * h) : h
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

/** One File → Attachment, or null if its type isn't accepted. */
export async function fileToAttachment(file: File): Promise<Attachment | null> {
  const name = resolveName(file)
  if (!name) return null
  const kind = attachmentKind(name)
  const dataUrl = await readDataUrl(file)
  const thumbDataUrl = kind === 'image' ? await thumbnail(dataUrl) : undefined
  return { id: newId(), name, kind, dataUrl, thumbDataUrl }
}

/** Convert dropped/pasted files into accepted Attachments (silently dropping the
 *  rest — a .docx or .zip just doesn't attach). */
export async function filesToAttachments(files: Iterable<File>): Promise<Attachment[]> {
  const out = await Promise.all([...files].map(fileToAttachment))
  return out.filter((a): a is Attachment => a != null)
}

/** Files carried by a paste/drag DataTransfer (e.g. a clipboard screenshot). */
export function filesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  if (data.files.length) return [...data.files]
  const out: File[] = []
  for (const item of data.items) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}

export function pickedToAttachment(p: PickedAttachment): Attachment {
  return { id: newId(), name: p.name, kind: p.kind, srcPath: p.path, thumbDataUrl: p.thumbDataUrl }
}

/** Run the OS picker and convert the result (bytes stay on disk via srcPath). */
export async function pickAttachments(): Promise<Attachment[]> {
  const picked = await client.attachmentsPick()
  return picked.map(pickedToAttachment)
}
