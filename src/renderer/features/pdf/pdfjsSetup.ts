import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** One-time pdf.js worker wiring (vite serves the worker as an asset). */
GlobalWorkerOptions.workerSrc = workerUrl

export { getDocument } from 'pdfjs-dist'
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
