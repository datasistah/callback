// Resume-file → plain text, extracted entirely in the browser.
//
// Uploading a resume shouldn't require a server round-trip or an API key: we read
// the file locally and pull out its text, then hand that to the existing base-
// profile flow (PUT /api/profile). Three formats:
//   - .txt / .md   — read as text (no library)
//   - .pdf         — pdfjs-dist, text layer only (no OCR of scanned images)
//   - .docx        — mammoth (raw text)
// Everything runs offline/free, matching the app's no-required-paid-dependency rule.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth/mammoth.browser.js'

// pdfjs needs its worker; Vite gives us a hashed URL for it.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx']
// For the file picker's `accept` attribute.
export const ACCEPT_ATTR =
  '.txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — comfortably covers any real resume.

function extensionOf(name) {
  const m = /\.[^.]+$/.exec(name || '')
  return m ? m[0].toLowerCase() : ''
}

// Tidy extracted text: normalize line endings, trim trailing spaces, and collapse
// runs of blank lines so a PDF's loose spacing reads like a resume, not a poem.
function normalize(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

async function extractPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      text += item.str
      // pdfjs marks the end of a visual line; otherwise items sit side by side.
      text += item.hasEOL ? '\n' : ' '
    }
    text += '\n\n'
  }
  return text
}

async function extractDocx(arrayBuffer) {
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return value
}

// Extract the text of a resume file. Resolves to a non-empty string, or throws an
// Error whose message is safe to show the user. Never persists anything — the
// caller reviews the text and saves it through the normal profile flow.
export async function extractResumeText(file) {
  if (!file) throw new Error('No file selected.')
  if (file.size > MAX_BYTES) {
    throw new Error('That file is larger than 8 MB — try exporting a lighter copy.')
  }

  const ext = extensionOf(file.name)
  const type = (file.type || '').toLowerCase()

  let raw
  try {
    if (ext === '.txt' || ext === '.md' || type === 'text/plain' || type === 'text/markdown') {
      raw = await file.text()
    } else if (ext === '.pdf' || type === 'application/pdf') {
      raw = await extractPdf(await file.arrayBuffer())
    } else if (
      ext === '.docx' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      raw = await extractDocx(await file.arrayBuffer())
    } else if (ext === '.doc') {
      throw new Error('Old .doc files aren\'t supported — save as .docx or PDF and try again.')
    } else {
      throw new Error(`Unsupported file type. Upload a ${ACCEPTED_EXTENSIONS.join(', ')} file.`)
    }
  } catch (err) {
    // Re-throw our own friendly errors as-is; wrap library/parse failures.
    if (err instanceof Error && /Unsupported|aren't supported|larger than/.test(err.message)) throw err
    throw new Error('Couldn\'t read that file — it may be corrupted or password-protected.')
  }

  const text = normalize(raw)
  if (!text) {
    throw new Error(
      'No text found in that file. If it\'s a scanned or image-only PDF, paste the text instead.'
    )
  }
  return text
}
