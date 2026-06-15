import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import type { GitClient } from '../infra/GitClient'

/** Resolve `rel` under `root` and assert it stays inside. Rejects absolute
 *  paths and `..` traversal with a typed PATH_ESCAPE the renderer can toast.
 *  `main` joins document:save/read unguarded; structural ops take arbitrary
 *  user-typed names, so every path goes through here. Exported for testing. */
export function safeJoin(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error('PATH_ESCAPE')
  const rootResolved = resolve(root)
  const resolved = resolve(rootResolved, rel)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
    throw new Error('PATH_ESCAPE')
  }
  return resolved
}

/** Structural file operations on the document repo (v0.2 sidebar file
 *  management). Each op stages through git and commits so the working tree
 *  stays clean for the next Claude op (ReviewService.prepare asserts it).
 *  Tracked paths use git mv/rm; untracked fall back to fs. Constructed per
 *  session alongside review/compiler/git (see DocumentSession). */
export class FileService {
  constructor(
    private root: string,
    private git: GitClient,
  ) {}

  /** Rename/move a file (basename change) or folder (dir + descendants, in
   *  one `git mv`). Collision → NAME_EXISTS. */
  async rename(from: string, to: string): Promise<void> {
    const fromAbs = safeJoin(this.root, from)
    const toAbs = safeJoin(this.root, to)
    if (!existsSync(fromAbs)) throw new Error('NO_SUCH_PATH')
    if (existsSync(toAbs)) throw new Error('NAME_EXISTS')
    mkdirSync(dirname(toAbs), { recursive: true })
    if (await this.git.isTracked(from)) {
      await this.git.mv(from, to)
    } else {
      renameSync(fromAbs, toAbs)
    }
    await this.commitIfDirty(`wip: rename ${from} → ${to}`)
  }

  /** Copy a file to a collision-free "<name> copy" sibling; returns its
   *  root-relative path (the renderer focuses it). */
  async duplicate(relPath: string): Promise<string> {
    const srcAbs = safeJoin(this.root, relPath)
    if (!existsSync(srcAbs)) throw new Error('NO_SUCH_PATH')
    const dest = this.freeDupPath(relPath)
    cpSync(srcAbs, safeJoin(this.root, dest), { recursive: true })
    await this.commitIfDirty(`wip: duplicate ${relPath} → ${dest}`)
    return dest
  }

  /** Remove a file or folder (recursive). */
  async remove(relPath: string): Promise<void> {
    const abs = safeJoin(this.root, relPath)
    if (!existsSync(abs)) throw new Error('NO_SUCH_PATH')
    if (await this.git.isTracked(relPath)) {
      await this.git.rm(relPath)
    }
    rmSync(abs, { recursive: true, force: true }) // sweep any untracked remainder
    await this.commitIfDirty(`wip: delete ${relPath}`)
  }

  /** Create an empty file under `dir` ('' = root); auto-bumps a colliding name
   *  ("untitled.tex" → "untitled 2.tex") rather than throwing, so the New file
   *  flow can't error on a stale name. Returns the created rel path. */
  async createFile(dir: string, name: string): Promise<string> {
    const rel = this.freeNamePath(dir ? `${dir}/${name}` : name)
    const abs = safeJoin(this.root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '')
    await this.commitIfDirty(`wip: create ${rel}`)
    return rel
  }

  /** Copy external files into `dir` ('' = root), auto-suffixing a colliding
   *  name (the same " copy" scheme as duplicate); one wip commit. Returns the
   *  new rel paths. Bytes come from the OS picker on the main side, not IPC. */
  async importFiles(dir: string, srcAbsPaths: string[]): Promise<string[]> {
    const rels: string[] = []
    for (const srcPath of srcAbsPaths) {
      const wanted = dir ? `${dir}/${basename(srcPath)}` : basename(srcPath)
      const rel = this.freeImportPath(wanted)
      const destAbs = safeJoin(this.root, rel)
      mkdirSync(dirname(destAbs), { recursive: true })
      cpSync(srcPath, destAbs)
      rels.push(rel)
    }
    await this.commitIfDirty(`wip: upload ${rels.length} file(s)`)
    return rels
  }

  /** Create an empty directory under `dir` ('' = root); auto-bumps a colliding
   *  name ("untitled" → "untitled 2") rather than throwing, so repeated New
   *  folder can't error (BUG-47). Returns the created rel path. */
  async createFolder(dir: string, name: string): Promise<string> {
    const rel = this.freeNamePath(dir ? `${dir}/${name}` : name)
    mkdirSync(safeJoin(this.root, rel), { recursive: true })
    // An empty dir has nothing for git to track (tree stays clean), but it now
    // surfaces in document:files via the directory walk (BUG-47) and persists on
    // disk across reopen; a git clean/reclone drops it (a .gitkeep would
    // persist — a product decision, deferred).
    return rel
  }

  /** `rel` itself if free, else the collision-suffixed " copy" variant. */
  private freeImportPath(rel: string): string {
    return existsSync(safeJoin(this.root, rel)) ? this.freeDupPath(rel) : rel
  }

  /** `rel` if free, else the first free "<base> N" variant (keeping any
   *  extension) — matches the renderer's uniqueName scheme so New file/New
   *  folder pick the same name whether the renderer or the service de-dupes,
   *  and never collide on a stale view (BUG-47). */
  private freeNamePath(rel: string): string {
    if (!existsSync(safeJoin(this.root, rel))) return rel
    const parent = dirname(rel)
    const ext = extname(rel)
    const base = basename(rel, ext)
    const prefix = parent === '.' ? '' : `${parent}/`
    let n = 2
    while (existsSync(safeJoin(this.root, `${prefix}${base} ${n}${ext}`))) n++
    return `${prefix}${base} ${n}${ext}`
  }

  /** First free "<base> copy[.ext]" variant, incrementing to stay unique. */
  private freeDupPath(relPath: string): string {
    let candidate = dupPath(relPath)
    let n = 2
    while (existsSync(join(this.root, candidate))) {
      candidate = dupPath(relPath, n++)
    }
    return candidate
  }

  private async commitIfDirty(subject: string): Promise<void> {
    if (!(await this.git.isClean())) await this.git.commitAll(subject)
  }
}

/** " copy" before the extension, mirroring the design mock's dupPath
 *  (`Workspace.jsx`): "intro.tex" → "intro copy.tex", "README" → "README
 *  copy". With `n`, inserts " copy <n>" for collision-free repeats. A leading
 *  dot is not an extension (dot index 0), matching the mock's `dot > 0`. */
function dupPath(full: string, n?: number): string {
  const slash = full.lastIndexOf('/')
  const dir = slash >= 0 ? full.slice(0, slash + 1) : ''
  const base = slash >= 0 ? full.slice(slash + 1) : full
  const suffix = n ? ` copy ${n}` : ' copy'
  const dot = base.lastIndexOf('.')
  return dot > 0
    ? `${dir}${base.slice(0, dot)}${suffix}${base.slice(dot)}`
    : `${dir}${base}${suffix}`
}
