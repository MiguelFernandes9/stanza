/** Files a user attaches to a chat prompt so the agent can analyze or mimic them
 *  (a screenshot to match, a PDF to summarize, a reference image). The block
 *  "snapshot" — a PNG of the selected block rendered in the PDF — is just one
 *  kind, so the same pipeline carries both. */
export type AttachmentKind = 'image' | 'pdf' | 'text' | 'snapshot'

/** One staged attachment. Bytes travel EITHER inline (`dataUrl` — clipboard
 *  paste, drag-drop, or a captured snapshot) OR by path (`srcPath` — an OS-picked
 *  file, copied at send time so a large PDF never round-trips through base64).
 *  The main process writes each to a per-op temp dir the headless CLI's Read tool
 *  can open (granted via --add-dir, removed after the turn). */
export interface Attachment {
  /** Renderer-generated; keys the chip and drives removal. */
  id: string
  /** Original filename WITH extension — the Read tool keys its handling off it. */
  name: string
  kind: AttachmentKind
  dataUrl?: string
  srcPath?: string
  /** Small downscaled image preview for the chip (images/snapshots only). */
  thumbDataUrl?: string
}

/** An attachment after the main process has staged it to disk — the input to the
 *  prompt builder (absolute path + kind for the "Read this" wording). */
export interface StagedAttachment {
  path: string
  name: string
  kind: AttachmentKind
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i

/** Extensions the headless Read tool opens with no preprocessing: images (viewed
 *  visually), pdf (paged), and the plain-text family. DOCX is deliberately absent
 *  — it needs server-side extraction the Read tool can't do. */
export const ACCEPTED_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|txt|md|tex|bib|csv|json|ya?ml|html?)$/i

/** Classify a user-supplied file by extension. Snapshots are tagged at capture,
 *  not inferred here, so this only returns image / pdf / text. */
export function attachmentKind(name: string): Exclude<AttachmentKind, 'snapshot'> {
  if (IMAGE_EXT.test(name)) return 'image'
  if (/\.pdf$/i.test(name)) return 'pdf'
  return 'text'
}

/** True when a filename is an attachable type. */
export function isAcceptedAttachment(name: string): boolean {
  return ACCEPTED_EXT.test(name)
}
