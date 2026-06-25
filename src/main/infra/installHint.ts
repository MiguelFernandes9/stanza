/** A platform-appropriate "how to install <tool>" suffix for not-found errors.
 *  Package names vary by distro and manager (and tectonic/latexdiff aren't in
 *  every default repo), so we name the common manager for the host OS and always
 *  point at the upstream URL rather than assert one exact package name. */
export function installHint(tool: string, url: string): string {
  switch (process.platform) {
    case 'darwin':
      return `install with \`brew install ${tool}\`, or see ${url}`
    case 'win32':
      return `install with \`scoop install ${tool}\` or \`choco install ${tool}\`, or see ${url}`
    default:
      return `install via your package manager (e.g. \`apt install ${tool}\` / \`dnf install ${tool}\`), or see ${url}`
  }
}
