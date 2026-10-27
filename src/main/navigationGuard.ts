import type { App, Shell, WebContents } from 'electron'
import { isAppRendererUrl, isSafeExternalUrl } from './rendererOrigin'

/** Lock every WebContents the app ever creates to the app's own renderer: a
 *  navigation (main frame or any sub-frame) to anything else is cancelled, and
 *  window.open never opens an Electron window — an https:/mailto: target is
 *  handed to the system browser/mail client, everything else is dropped. A
 *  malicious link in rendered project content therefore can't replace the
 *  privileged renderer (which holds the preload bridge) with foreign content. */
export function installNavigationGuards(app: App, shell: Pick<Shell, 'openExternal'>): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event) => {
      if (!isAppRendererUrl(event.url)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (!isAppRendererUrl(event.url)) event.preventDefault()
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}
