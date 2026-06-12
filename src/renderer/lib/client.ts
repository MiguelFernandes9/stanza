import { api } from './ipc'
import type { StanzaClient } from './ipc'

/** The renderer's IPC client. Real handlers landed with feat/backend-core;
 *  the FD2-FD4 mock layer is gone. All features import `client`, never
 *  `api` directly — keep this indirection for future test doubles. */
export const client: StanzaClient = api
