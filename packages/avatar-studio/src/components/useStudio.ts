/* The studio controller: document state, stable actions, announcements, autosave, the
 * host callbacks (onChange / onSave), keyboard shortcuts and the thumbnail base. */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react'
import {
  addItem,
  applyOutfit,
  applySpecies,
  encodeShareCode,
  freshSeed,
  itemSpec,
  moveItem,
  randomDNA,
  removeItem,
  setItemParam,
  setParam,
  speciesPreset,
  withName,
  withSeed,
  type AvatarDNA,
  type AvatarKind,
  type ItemRef,
} from '@arkplay/avatar-engine'
import { inlineAssets, remoteAssetIds } from '../render/assets.ts'
import { dnaKey } from '../render/keys.ts'
import { keepCustomArt, makeKind, rollAvatar } from '../state/randomize.ts'
import { resolveAvatar } from '../state/share.ts'
import { DEFAULT_DRAFT_KEY, browserStorage, loadDraft, saveDraft } from '../state/storage.ts'
import { initStudio, studioReducer, type StudioState } from '../state/studio.ts'
import { fmt, type StudioStrings } from '../strings.ts'
import type { AvatarStudioProps } from '../types.ts'
import type { StudioActions, ThumbBase, ToastAction } from './context.ts'

export const ALL_KINDS: AvatarKind[] = ['humanoid', 'creature']

export function normalizeKinds(kinds?: AvatarKind[]): AvatarKind[] {
  const k = ALL_KINDS.filter((x) => !kinds || kinds.includes(x))
  return k.length ? k : ALL_KINDS
}

const fitKind = (dna: AvatarDNA, kinds: AvatarKind[]): AvatarDNA => (kinds.includes(dna.kind) ? dna : makeKind(kinds[0], dna, freshSeed()))

interface Boot {
  dna: AvatarDNA
  error?: string
  restored?: boolean
}

function boot(props: AvatarStudioProps, kinds: AvatarKind[], s: StudioStrings): Boot {
  let error: string | undefined
  if (props.initial !== undefined && props.initial !== null) {
    const r = resolveAvatar(props.initial)
    if (r.ok) return { dna: fitKind(r.dna, kinds) }
    error = fmt(s.loadFailed, { message: r.message })
  } else if (props.draftKey !== false) {
    const d = loadDraft(browserStorage(), props.draftKey ?? DEFAULT_DRAFT_KEY)
    if (d) return { dna: fitKind(d, kinds), restored: true }
  }
  return { dna: randomDNA({ seed: freshSeed(), kind: kinds.includes('humanoid') ? 'humanoid' : 'creature' }), error }
}

const itemLabel = (it: ItemRef, s: StudioStrings) => (it.id === 'custom' ? it.asset?.name || s.customImage : (itemSpec(it.id)?.label ?? it.id))

export interface Toast {
  text: string
  action?: ToastAction
  n: number
}

export interface StudioController {
  state: StudioState
  actions: StudioActions
  kinds: AvatarKind[]
  announcement: string
  toast: Toast | null
  dismissToast: () => void
  theme: string
  setTheme: (id: string) => void
  save: () => Promise<void>
  saving: boolean
  saveError: string | null
  notice: string | null
  dismissNotice: () => void
  draftSaved: boolean
  thumbBase: ThumbBase
}

export function useStudio(props: AvatarStudioProps, s: StudioStrings, rootRef: RefObject<HTMLElement | null>): StudioController {
  // Keyed by content: hosts often pass a fresh array literal on every render.
  const kindsKey = (props.kinds ?? []).join(',')
  const kinds = useMemo(() => normalizeKinds(kindsKey ? (kindsKey.split(',') as AvatarKind[]) : undefined), [kindsKey])
  const [start] = useState(() => boot(props, kinds, s))
  const [state, dispatch] = useReducer(studioReducer, start.dna, (dna: AvatarDNA) => initStudio(dna, s.h_start))
  const [theme, setTheme] = useState('any')
  const [announce, setAnnounce] = useState({ text: '', n: 0 })
  const [toast, setToast] = useState<Toast | null>(start.restored ? { text: s.restoredDraft, n: 1 } : null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(start.error ?? null)
  const [draftSaved, setDraftSaved] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const sRef = useRef(s)
  sRef.current = s
  const propsRef = useRef(props)
  propsRef.current = props
  const themeRef = useRef(theme)
  themeRef.current = theme
  const kindsRef = useRef(kinds)
  kindsRef.current = kinds
  const savingRef = useRef(false)

  const actions = useMemo<StudioActions>(() => {
    const cur = () => stateRef.current.history.present
    const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }))
    const toastIt = (text: string, action?: ToastAction) => setToast((t) => ({ text, action, n: (t?.n ?? 0) + 1 }))
    const edit: StudioActions['edit'] = (label, fn, group) => dispatch({ type: 'edit', label, fn, group })
    const self: StudioActions = {
      edit,
      seal: () => dispatch({ type: 'seal' }),
      setParam: (section, key, value, label, group) => edit(label, (d) => setParam(d, section, key, value), group),
      setItemParam: (list, index, key, value, label, group) => edit(label, (d) => setItemParam(d, list, index, key, value), group),
      addItem(id, params, asset) {
        const s = sRef.current
        const before = cur()
        const after = addItem(before, id, params, asset)
        if (after === before) return
        const added = after.outfit.concat(after.accessories).find((i) => !before.outfit.includes(i) && !before.accessories.includes(i))
        const label = added ? itemLabel(added, s) : id
        const kept = new Set(after.outfit.concat(after.accessories))
        const replaced = before.outfit.concat(before.accessories).filter((i) => !kept.has(i)).map((i) => itemLabel(i, s))
        edit(fmt(s.h_addItem, { item: label }), (d) => addItem(d, id, params, asset))
        say(replaced.length ? fmt(s.itemReplaced, { item: label, replaced: replaced.join(', ') }) : fmt(s.itemAdded, { item: label }))
      },
      removeItem(list, index) {
        const s = sRef.current
        const it = cur()[list][index]
        if (!it) return
        const label = itemLabel(it, s)
        edit(fmt(s.h_removeItem, { item: label }), (d) => removeItem(d, index, list))
        say(fmt(s.itemRemoved, { item: label }))
      },
      removeSlot(list, slot) {
        const s = sRef.current
        const gone = cur()[list].filter((x) => itemSpec(x.id)?.slot === slot)
        if (!gone.length) return
        const label = gone.map((x) => itemLabel(x, s)).join(', ')
        edit(fmt(s.h_removeItem, { item: label }), (d) => ({ ...d, [list]: d[list].filter((x) => itemSpec(x.id)?.slot !== slot) }))
        say(fmt(s.itemRemoved, { item: label }))
      },
      moveItem(list, index, delta) {
        const it = cur()[list][index]
        if (!it) return
        edit(fmt(sRef.current.h_moveItem, { item: itemLabel(it, sRef.current) }), (d) => moveItem(d, list, index, delta))
      },
      load: (dna, label) => dispatch({ type: 'load', dna, label: label ?? sRef.current.h_load }),
      undo() {
        const h = stateRef.current.history
        const s = sRef.current
        if (!h.past.length) return say(s.nothingToUndo)
        say(fmt(s.undid, { label: h.presentLabel }))
        dispatch({ type: 'undo' })
      },
      redo() {
        const h = stateRef.current.history
        const s = sRef.current
        if (!h.future.length) return say(s.nothingToRedo)
        say(fmt(s.redid, { label: h.future[0].label }))
        dispatch({ type: 'redo' })
      },
      jump(index) {
        dispatch({ type: 'jump', index })
      },
      randomize() {
        const s = sRef.current
        const seed = freshSeed()
        const theme = themeRef.current
        const locks = stateRef.current.locks
        edit(s.h_randomize, (d) => rollAvatar(d, { seed, theme, locks }))
        say(s.randomized)
        toastIt(s.newLook, { label: s.undo, run: () => self.undo() })
      },
      randomizeSection(id, label) {
        const s = sRef.current
        const seed = freshSeed()
        const theme = themeRef.current
        // Asking for one section overrides that section's own lock (not its params' locks).
        const locks = stateRef.current.locks.filter((l) => l !== id)
        edit(fmt(s.h_randomizeSection, { section: label }), (d) => rollAvatar(d, { seed, theme, locks, only: [id] }))
        say(fmt(s.randomizedSection, { section: label }))
      },
      toggleLock: (id) => dispatch({ type: 'toggleLock', id }),
      setLocks: (ids) => dispatch({ type: 'setLocks', locks: ids }),
      setKind(kind) {
        const s = sRef.current
        if (!kindsRef.current.includes(kind) || cur().kind === kind) return
        const seed = freshSeed()
        const name = s[`kind_${kind}`]
        dispatch({ type: 'setKind', kind, label: fmt(s.h_kind, { kind: name }), make: (k, from) => makeKind(k, from, seed) })
        say(fmt(s.kindSwitched, { kind: name }))
      },
      applySpecies(id) {
        const label = speciesPreset(id)?.label ?? id
        edit(fmt(sRef.current.h_species, { species: label }), (d) => applySpecies(d, id))
        say(fmt(sRef.current.h_species, { species: label }))
      },
      setName: (name) => edit(sRef.current.h_name, (d) => withName(d, name), 'name'),
      wearOutfit(o) {
        const s = sRef.current
        edit(fmt(s.h_outfit, { name: o.name }), (d) => keepCustomArt(d, applyOutfit(d, o)))
        say(fmt(s.outfitApplied, { name: o.name }))
      },
      shuffleSeed() {
        const seed = freshSeed()
        edit(sRef.current.h_seed, (d) => withSeed(d, seed))
      },
      announce: say,
      toast: toastIt,
      lookup: (section, key) => stateRef.current.history.present.sections[section]?.[key],
      current: cur,
    }
    return self
  }, [])

  const dna = state.history.present
  const group = state.history.group

  // onChange: once per committed edit (a drag reports when it ends).
  const reported = useRef(dna)
  useEffect(() => {
    if (group !== null || dna === reported.current) return
    reported.current = dna
    propsRef.current.onChange?.(dna)
  }, [dna, group])

  // Autosave the draft shortly after edits settle.
  const draftKey = props.draftKey === false ? null : (props.draftKey ?? DEFAULT_DRAFT_KEY)
  useEffect(() => {
    if (!draftKey || group !== null) return
    const t = setTimeout(() => {
      if (saveDraft(browserStorage(), draftKey, dna)) setDraftSaved(true)
    }, 600)
    return () => clearTimeout(t)
  }, [dna, group, draftKey])

  // A new `initial` after mount loads that avatar as an undoable step.
  const firstInitial = useRef(props.initial)
  useEffect(() => {
    if (props.initial === firstInitial.current || props.initial === undefined) return
    firstInitial.current = props.initial
    const r = resolveAvatar(props.initial)
    if (r.ok) actions.load(fitKind(r.dna, kindsRef.current))
    else setNotice(fmt(sRef.current.loadFailed, { message: r.message }))
  }, [props.initial, actions])

  // Keyboard shortcuts, scoped to the studio (and the bare page when nothing has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      const t = e.target as HTMLElement | null
      const root = rootRef.current
      if (!root || !t || !(root.contains(t) || t === document.body || t === document.documentElement)) return
      // Text fields keep their own undo.
      if (t instanceof HTMLTextAreaElement || t.isContentEditable) return
      if (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'color', 'submit'].includes(t.type)) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) actions.redo()
      else actions.undo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [actions, rootRef])

  // Toasts fade on their own.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  const save = useCallback(async () => {
    const onSave = propsRef.current.onSave
    if (!onSave || savingRef.current) return
    dispatch({ type: 'seal' })
    const d = stateRef.current.history.present
    let code = ''
    try {
      code = encodeShareCode(d)
    } catch {
      // A code is a convenience; the DNA is what gets saved.
    }
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ dna: d, code, name: d.name })
      setAnnounce((a) => ({ text: sRef.current.saved, n: a.n + 1 }))
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : typeof e === 'string' && e ? e : sRef.current.unknownError
      setSaveError(message)
      setAnnounce((a) => ({ text: fmt(sRef.current.saveFailed, { message }), n: a.n + 1 }))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [])

  // Thumbnails follow the avatar once edits pause (longer while a drag is in progress).
  const [thumbDna, setThumbDna] = useState(dna)
  useEffect(() => {
    if (thumbDna === dna) return
    const t = setTimeout(() => setThumbDna(dna), group !== null ? 320 : 90)
    return () => clearTimeout(t)
  }, [dna, group, thumbDna])

  // Uploaded art that lives in the service is inlined so image thumbnails can show it.
  const [assets, setAssets] = useState<Record<string, string>>({})
  const remote = remoteAssetIds(thumbDna).join(',')
  useEffect(() => {
    if (!remote) return
    let live = true
    void inlineAssets(stateRef.current.history.present, propsRef.current.assetUrl).then((m) => {
      if (live) setAssets(m)
    })
    return () => {
      live = false
    }
  }, [remote])

  const thumbBase = useMemo<ThumbBase>(() => {
    const n = Object.keys(assets).length
    return { dna: thumbDna, key: `${dnaKey(thumbDna)}${n ? `#a${n}` : ''}`, assets: n ? assets : undefined }
  }, [thumbDna, assets])

  const dismissToast = useCallback(() => setToast(null), [])
  const dismissNotice = useCallback(() => setNotice(null), [])
  const announcement = announce.text + (announce.n % 2 ? '\u00a0' : '')

  return { state, actions, kinds, announcement, toast, dismissToast, theme, setTheme, save, saving, saveError, notice, dismissNotice, draftSaved, thumbBase }
}
