import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { PERM_LABELS, fetchAllUsersPermissions, saveUserPermission } from '../../../lib/adminPermissions'

const ROLE_BADGE_TEXT = {
  owner: 'Owner',
  mis: 'MIS',
  pc: 'PC',
}

// Ported from old-portal/js/adminperms.js's loadAdminPermsPanel/acpRender/
// acpSave — MIS-only permission editor. role_defaults/user_permissions are
// plain key-value tables, so every toggle here is generic except
// checklist_scope, which is an 'own'/'all' select, not a boolean.
export default function AccessControlPanel() {
  const { currentUser } = useAuth()
  const isMis = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim() === 'mis'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [allKeys, setAllKeys] = useState([])
  const [search, setSearch] = useState('')
  const [savingKey, setSavingKey] = useState(null) // `${email}:${permission}` while a save is in flight
  const [savedKey, setSavedKey] = useState(null) // brief success flash

  useEffect(() => {
    if (!isMis || !currentUser?.email) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, gated on isMis/currentUser resolving
    setLoading(true)
    setError('')
    fetchAllUsersPermissions(currentUser.email)
      .then(({ users, allKeys }) => {
        setUsers(users)
        setAllKeys(allKeys)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isMis, currentUser?.email])

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return users
    return users.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').includes(q))
  }, [users, search])

  async function handleSave(email, permission, value) {
    if (!isMis || !currentUser?.email) {
      alert('⛔ Only MIS can change permissions.')
      return
    }
    const key = `${email}:${permission}`
    setSavingKey(key)
    try {
      await saveUserPermission(currentUser.email, email, permission, value)
      setUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, permissions: { ...u.permissions, [permission]: value } } : u))
      )
      setSavedKey(key)
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500)
    } catch (e) {
      alert('❌ Failed to save: ' + e.message)
    } finally {
      setSavingKey(null)
    }
  }

  if (!isMis) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center">
        <div className="text-[15px] text-text-muted">⛔ Access denied. This section is restricted to MIS.</div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-1">
        <div className="text-[18px] font-bold text-text">🔐 Access Control</div>
        <div className="text-[13.5px] text-text-muted mt-0.5">Manage what each person can see and do</div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[15px]">⏳ Loading employees…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[15px]">❌ {error}</div>}

      {!loading && !error && (
        <div className="mt-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search by name or email…"
            className="w-full rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none mb-4"
          />

          {!filteredUsers.length && (
            <div className="text-center py-10 text-text-muted text-[14.5px]">No employees found</div>
          )}

          <div className="flex flex-col gap-3">
            {filteredUsers.map((u) => (
              <UserPermCard
                key={u.email}
                user={u}
                allKeys={allKeys}
                savingKey={savingKey}
                savedKey={savedKey}
                onSave={handleSave}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserPermCard({ user, allKeys, savingKey, savedKey, onSave }) {
  const perms = user.permissions || {}
  const roleLabel = ROLE_BADGE_TEXT[user.role] || user.role || '—'

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3 mb-3.5">
        <div className="w-9 h-9 rounded-full bg-primary-tint border border-primary/20 text-primary flex items-center justify-center text-[16px] font-extrabold shrink-0">
          {(user.name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-text truncate">{user.name}</div>
          <div className="text-[13px] text-text-muted truncate">{user.email}</div>
        </div>
        <span className="text-[12.5px] font-bold text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1 shrink-0">
          {roleLabel}
        </span>
      </div>

      <div className="flex flex-col">
        {allKeys.map((key) => {
          const label = PERM_LABELS[key] || key
          const val = perms[key] || 'false'
          const rowKey = `${user.email}:${key}`
          const isSaving = savingKey === rowKey
          const justSaved = savedKey === rowKey

          return (
            <div key={key} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0">
              <span className="text-[14px] text-text-muted">{label}</span>
              <div className="flex items-center gap-2 shrink-0">
                {isSaving && <span className="text-[12px] text-text-muted">Saving…</span>}
                {!isSaving && justSaved && <span className="text-[12px] text-primary">✓ Saved</span>}
                {key === 'checklist_scope' ? (
                  <select
                    value={val === 'all' ? 'all' : 'own'}
                    onChange={(e) => onSave(user.email, key, e.target.value)}
                    className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13.5px] text-text outline-none"
                  >
                    <option value="own">Own data only</option>
                    <option value="all">All employees</option>
                  </select>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={val === 'true'}
                    onClick={() => onSave(user.email, key, val === 'true' ? 'false' : 'true')}
                    className={`relative w-9 h-[22px] rounded-full shrink-0 transition-colors ${
                      val === 'true' ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                        val === 'true' ? 'left-[18px]' : 'left-[3px]'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
