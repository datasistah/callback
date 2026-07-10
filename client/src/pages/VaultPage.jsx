import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

// Kinds mirror the backend's VALID_KINDS. Each gets a subtle colored badge so
// the vault scans quickly by category.
const KINDS = [
  { key: 'experience', label: 'Experience', badge: 'bg-accent/15 text-accent-hover' },
  { key: 'project', label: 'Project', badge: 'bg-emerald-500/15 text-emerald-300' },
  { key: 'achievement', label: 'Achievement', badge: 'bg-amber-500/15 text-amber-300' },
  { key: 'skill', label: 'Skill', badge: 'bg-sky-500/15 text-sky-300' },
  { key: 'education', label: 'Education', badge: 'bg-fuchsia-500/15 text-fuchsia-300' },
]
const KIND_MAP = Object.fromEntries(KINDS.map((k) => [k.key, k]))

const inputClass =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent'

function KindBadge({ kind }) {
  const meta = KIND_MAP[kind] || { label: kind, badge: 'bg-surface-hover text-muted' }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  )
}

// Add / edit form. `initial` present → edit mode. onSubmit(fields) returns a
// promise; onCancel closes the form.
function ItemForm({ initial, onSubmit, onCancel }) {
  const [kind, setKind] = useState(initial?.kind || 'experience')
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [source, setSource] = useState(initial?.source || '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const contentValid = content.trim().length > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!contentValid) {
      setError('Content is required.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        kind,
        title: title.trim(),
        content: content.trim(),
        source: source.trim(),
      })
    } catch (err) {
      setError(err.message || 'Could not save the item.')
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="vault-item-form"
      className="rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">
          {initial ? 'Edit item' : 'Add a career item'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <ErrorBanner message={error} className="mb-4" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kind" className="block text-sm font-medium text-ink">
            Kind
          </label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-ink">
            Title <span className="text-muted">(optional)</span>
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Senior ML Engineer at Northwind"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="content" className="block text-sm font-medium text-ink">
          Content
        </label>
        <textarea
          id="content"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={inputClass}
          placeholder="Describe one atomic accomplishment, skill, or role — the more specific, the better it grounds tailored bullets."
        />
      </div>

      <div className="mt-4">
        <label htmlFor="source" className="block text-sm font-medium text-ink">
          Source <span className="text-muted">(optional)</span>
        </label>
        <input
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={inputClass}
          placeholder="Where this came from — e.g. 2023 performance review"
        />
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          data-testid="save-vault-item"
          disabled={!contentValid || submitting}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Add item'}
        </button>
      </div>
    </form>
  )
}

function ItemCard({ item, onEdit, onDelete, busy }) {
  return (
    <div
      data-testid="vault-item"
      className="rounded-lg border border-border bg-surface p-4 shadow-sm transition hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <KindBadge kind={item.kind} />
          {item.title && (
            <h3 className="mt-2 text-sm font-semibold text-ink">{item.title}</h3>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => onEdit(item)}
            disabled={busy}
            data-testid={`edit-vault-${item.id}`}
            className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:bg-surface-hover hover:text-ink disabled:opacity-50"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(item)}
            disabled={busy}
            data-testid={`delete-vault-${item.id}`}
            aria-label="Delete item"
            className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
        {item.content}
      </p>
      {item.source && (
        <p className="mt-2 text-xs text-muted">Source: {item.source}</p>
      )}
    </div>
  )
}

export default function VaultPage() {
  const api = useApi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [building, setBuilding] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api.listVault()
      setItems(data || [])
    } catch (err) {
      setLoadError(err.message || 'Could not load your Career Vault.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c = { all: items.length }
    for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1
    return c
  }, [items])

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  )

  const handleCreate = async (fields) => {
    const created = await api.createVaultItem(fields)
    setItems((prev) => [created, ...prev])
    setAdding(false)
    setNotice('Career item added.')
  }

  const handleUpdate = async (id, fields) => {
    const updated = await api.updateVaultItem(id, fields)
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
    setEditingId(null)
    setNotice('Career item updated.')
  }

  const handleDelete = async (item) => {
    setActionError('')
    setBusyId(item.id)
    const snapshot = items
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await api.deleteVaultItem(item.id)
      setNotice('Career item deleted.')
    } catch (err) {
      setItems(snapshot)
      setActionError(err.message || 'Could not delete the item.')
    } finally {
      setBusyId(null)
    }
  }

  const handleBuildFromProfile = async () => {
    setActionError('')
    setNotice('')
    setBuilding(true)
    try {
      const created = await api.buildVaultFromProfile()
      const added = created || []
      setItems((prev) => [...added, ...prev])
      setNotice(
        added.length
          ? `Added ${added.length} item${added.length === 1 ? '' : 's'} from your base profile.`
          : 'No new items were derived from your profile.'
      )
    } catch (err) {
      setActionError(err.message || 'Could not build from your profile.')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Career Vault
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Your longitudinal record of atomic career facts. Every tailored
            résumé bullet is grounded in — and cites — an item here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBuildFromProfile}
            disabled={building}
            data-testid="build-from-profile"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {building ? 'Building…' : 'Build from profile'}
          </button>
          {!adding && !editingId && (
            <button
              onClick={() => {
                setAdding(true)
                setNotice('')
              }}
              data-testid="add-vault-item"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Add item
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={loadError} className="mb-4" />
      <ErrorBanner message={actionError} className="mb-4" />
      {notice && <ErrorBanner message={notice} tone="info" className="mb-4" />}

      {adding && (
        <div className="mb-6">
          <ItemForm onSubmit={handleCreate} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loading ? (
        <div className="py-24">
          <Spinner label="Loading your vault…" className="justify-center" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/40 py-20 text-center">
          <p className="text-lg font-medium text-ink">Your vault is empty</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Add items by hand, or click{' '}
            <span className="font-medium text-ink">Build from profile</span> to
            chunk your base profile into vault items automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Kind filter */}
          <div className="mb-5 flex flex-wrap gap-2">
            {[{ key: 'all', label: 'All' }, ...KINDS].map((k) => {
              const active = filter === k.key
              const count = counts[k.key] || 0
              return (
                <button
                  key={k.key}
                  onClick={() => setFilter(k.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-accent bg-accent/15 text-accent-hover'
                      : 'border-border text-muted hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {k.label}
                  <span className="ml-1.5 text-muted">{count}</span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className="sm:col-span-2">
                  <ItemForm
                    initial={item}
                    onSubmit={(fields) => handleUpdate(item.id, fields)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <ItemCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onEdit={(it) => {
                    setEditingId(it.id)
                    setAdding(false)
                    setNotice('')
                  }}
                  onDelete={handleDelete}
                />
              )
            )}
          </div>

          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              No {KIND_MAP[filter]?.label.toLowerCase()} items yet.
            </p>
          )}
        </>
      )}
    </div>
  )
}
