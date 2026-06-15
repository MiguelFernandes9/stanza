/** The two save→compile triggers, as pure orchestration over injectable
 *  effects (the third trigger, accept, just calls compile directly; first
 *  compile on open is a startup effect). Disk is the source of truth: each
 *  writes the relevant buffers to disk BEFORE compiling, so the compile always
 *  rebuilds what is on disk. See docs/compile-triggers.md. */

/** ⌘S (trigger 1): write the ACTIVE file to disk, then compile. Always compiles
 *  — a no-op save still rebuilds disk, which is explicit and predictable. Other
 *  dirty tabs stay staged until their own ⌘S. */
export async function saveActiveAndCompile(
  activeFile: string,
  saveActive: (file: string) => Promise<void>,
  compile: () => void
): Promise<void> {
  if (activeFile) await saveActive(activeFile)
  compile()
}

/** ⌘R / recompile button (trigger 3): write ALL dirty buffers, then compile —
 *  the explicit "make the PDF current" action. */
export async function saveAllAndCompile(
  saveDirty: () => Promise<string[]>,
  compile: () => void
): Promise<void> {
  await saveDirty()
  compile()
}
