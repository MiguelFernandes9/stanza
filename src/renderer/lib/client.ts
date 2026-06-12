import { api } from './ipc'
import { mockClient } from './mock'
import type { StanzaClient } from './ipc'

/** Mocked while the main-process handlers are M0 NOT_IMPLEMENTED stubs.
 *  The backend wiring pass flips the default (set VITE_STANZA_MOCK=0 to
 *  hit real IPC early). All features import `client`, never `api`. */
export const MOCKED = import.meta.env.VITE_STANZA_MOCK !== '0'

export const client: StanzaClient = MOCKED ? mockClient : api
