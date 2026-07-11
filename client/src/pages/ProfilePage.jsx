import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

// File-picker accept list. The extractor itself (which pulls in the heavy PDF /
// DOCX parsers) is dynamically imported only when a file is actually chosen, so
// those libraries stay out of the main bundle.
const ACCEPT_ATTR =
  '.txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export default function ProfilePage() {
  const api = useApi()
  const fileInputRef = useRef(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedNote, setSeedNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const profile = await api.getProfile()
      setContent(profile?.content || '')
    } catch (err) {
      setLoadError(err.message || 'Could not load your profile.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const contentValid = content.trim().length > 0

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return
    setSaveError('')
    setSaved(false)
    setSeedNote('')
    setUploadNote('')
    setUploading(true)
    try {
      const { extractResumeText } = await import('../lib/resumeFile.js')
      const text = await extractResumeText(file)
      setContent(text)
      setUploadNote(`Loaded “${file.name}” — review the text below, then save.`)
    } catch (err) {
      setSaveError(err.message || 'Could not read that file.')
    } finally {
      setUploading(false)
    }
  }

  // First-save convenience: seed the Career Vault straight from the profile so
  // setup is one motion, not two. build-from-profile is additive (it never
  // deletes), so we only auto-seed when the vault is still empty — a populated
  // vault is the user's curated record and we must not duplicate into it. Any
  // re-seeding stays an explicit tap on the Career Vault page. Best-effort: the
  // profile is already saved, so a vault failure is a soft note, not an error.
  const maybeSeedVault = async () => {
    try {
      const existing = await api.listVault()
      if (existing && existing.length > 0) return
      setSeeding(true)
      const created = await api.buildVaultFromProfile()
      const n = created?.length || 0
      if (n > 0) {
        setSeedNote(
          `Seeded your Career Vault with ${n} item${n === 1 ? '' : 's'}.`
        )
      }
    } catch {
      setSeedNote(
        'Couldn’t auto-seed your Career Vault — open Career Vault to build it.'
      )
    } finally {
      setSeeding(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setSaved(false)
    setSeedNote('')
    if (!contentValid) {
      setSaveError('Your base profile cannot be empty.')
      return
    }
    setSaving(true)
    try {
      const updated = await api.saveProfile(content.trim())
      setContent(updated?.content || content.trim())
      setSaved(true)
      await maybeSeedVault()
    } catch (err) {
      setSaveError(err.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Base profile
      </h1>
      <p className="mt-1 text-sm text-muted">
        Upload or paste your master resume once. Every tailored resume and
        cover letter draws from this — and it seeds your Career Vault.
      </p>

      <ErrorBanner message={loadError} className="mt-6" />

      {loading ? (
        <div className="py-24">
          <Spinner label="Loading your profile…" className="justify-center" />
        </div>
      ) : (
        <form onSubmit={handleSave} noValidate className="mt-6">
          <ErrorBanner message={saveError} className="mb-4" />
          {saved && (
            <ErrorBanner
              message={
                seedNote ? `Base profile saved. ${seedNote}` : 'Base profile saved.'
              }
              tone="info"
              className="mb-4"
            />
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg/40 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFile}
              data-testid="resume-file-input"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="upload-resume"
              className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Reading…' : 'Upload résumé file'}
            </button>
            <span className="text-xs text-muted">
              PDF, Word (.docx), or text — read in your browser, nothing leaves your device until you save.
            </span>
            {uploadNote && (
              <p className="w-full text-xs text-emerald-400">{uploadNote}</p>
            )}
          </div>

          <label
            htmlFor="content"
            className="block text-sm font-medium text-ink"
          >
            Base resume / profile
          </label>
          <textarea
            id="content"
            name="content"
            rows={16}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setSaved(false)
              setSeedNote('')
            }}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Paste your full resume or professional history here…"
          />
          {!contentValid && (
            <p className="mt-1 text-xs text-muted">
              Add your history so tailoring has something to work from.
            </p>
          )}

          <div className="mt-5">
            <button
              type="submit"
              data-testid="save-profile"
              disabled={!contentValid || saving}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (seeding ? 'Seeding vault…' : 'Saving…') : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
