// store.js — 本地存储数据层（Session 制）
// 存储键：profile / sessions[] / activeSessionId / trainings[] / settings

const KEYS = {
  PROFILE: 'profile',
  SESSIONS: 'sessions',
  ACTIVE: 'activeSessionId',
  TRAININGS: 'trainings',
  SETTINGS: 'settings'
}

function get(key, def) {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined || v === null ? def : v
  } catch (e) {
    return def
  }
}

function set(key, val) {
  try {
    wx.setStorageSync(key, val)
  } catch (e) {
    console.error('存储失败', key, e)
  }
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// ============ 档案 ============

function getProfile() {
  return get(KEYS.PROFILE, null)
}

function saveProfile(profile) {
  profile.updatedAt = new Date().toISOString()
  set(KEYS.PROFILE, profile)
  return profile
}

// ============ 康复周期 Session ============

function getSessions() {
  return get(KEYS.SESSIONS, [])
}

function getSession(id) {
  return getSessions().find(s => s.id === id) || null
}

function getActiveSession() {
  const id = get(KEYS.ACTIVE, null)
  return id ? getSession(id) : null
}

// 创建新周期：档案快照 + 空基线
function createSession() {
  const profile = getProfile()
  const sessions = getSessions()
  const idx = sessions.length + 1
  const session = {
    id: genId('sess'),
    createdAt: new Date().toISOString(),
    title: '康复周期 ' + idx,
    note: '',
    profileSnapshot: Object.assign({ takenAt: new Date().toISOString() }, profile),
    baseline: null,          // 每周期独立重录
    baselineHistory: [],
    status: 'active'
  }
  sessions.push(session)
  set(KEYS.SESSIONS, sessions)
  set(KEYS.ACTIVE, session.id)
  return session
}

// 将其他周期归档，指定新的活跃周期
function switchSession(id) {
  const sessions = getSessions()
  sessions.forEach(s => {
    s.status = s.id === id ? 'active' : 'archived'
  })
  set(KEYS.SESSIONS, sessions)
  set(KEYS.ACTIVE, id)
  return getSession(id)
}

// 保存基线快照到当前周期；旧快照入 baselineHistory；追溯补算训练差值
function saveBaseline(baseline) {
  const sessions = getSessions()
  const idx = sessions.findIndex(s => s.id === baseline.sessionId)
  if (idx === -1) return null

  const s = sessions[idx]
  if (s.baseline) {
    s.baselineHistory.push(s.baseline)
    if (s.baselineHistory.length > 10) s.baselineHistory.shift()
  }
  s.baseline = baseline
  s.baselineUpdatedAt = baseline.createdAt
  set(KEYS.SESSIONS, sessions)

  // 追溯补算该周期所有训练记录的 vsBaseline
  recomputeVsBaseline(baseline.sessionId, baseline)
  return baseline
}

// 更新周期信息（标题/备注）
function updateSession(id, patch) {
  const sessions = getSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return null
  sessions[idx] = Object.assign({}, sessions[idx], patch)
  set(KEYS.SESSIONS, sessions)
  return sessions[idx]
}

// ============ 训练记录 ============

function getTrainings() {
  return get(KEYS.TRAININGS, [])
}

function addTraining(t) {
  const list = getTrainings()
  list.push(t)
  // 超 500 条归档最旧 100 条
  if (list.length > 500) list.splice(0, list.length - 500)
  set(KEYS.TRAININGS, list)
  return t
}

// 计算训练相对基线差值（无基线 → null）
function computeVsBaseline(record) {
  const session = getSession(record.sessionId)
  if (!session || !session.baseline) return null
  const b = session.baseline
  const ref = b.levels.normal
  if (!ref) return null
  return {
    db: Math.round((record.peakDb - ref.peakDb) * 10) / 10,
    dur: Math.round((record.durationSec - ref.durationSec) * 10) / 10
  }
}

// 追溯补算：某周期基线更新后，重算该周期所有训练记录的 vsBaseline
function recomputeVsBaseline(sessionId, baseline) {
  const list = getTrainings()
  let changed = false
  list.forEach(t => {
    if (t.sessionId !== sessionId) return
    const rec = Object.assign({}, t, { peakDb: t.peakDb, durationSec: t.durationSec })
    const vs = computeVsBaselineWith(rec, baseline)
    if (vs && (!t.vsBaseline || t.vsBaseline.db !== vs.db || t.vsBaseline.dur !== vs.dur)) {
      t.vsBaseline = vs
      changed = true
    } else if (!vs && t.vsBaseline) {
      t.vsBaseline = null
      changed = true
    }
  })
  if (changed) set(KEYS.TRAININGS, list)
}

function computeVsBaselineWith(record, baseline) {
  if (!baseline || !baseline.levels || !baseline.levels.normal) return null
  const ref = baseline.levels.normal
  return {
    db: Math.round((record.peakDb - ref.peakDb) * 10) / 10,
    dur: Math.round((record.durationSec - ref.durationSec) * 10) / 10
  }
}

// ============ 设置 ============

function getSettings() {
  return Object.assign({ thresholdDb: 50, micDistance: '15-20cm' }, get(KEYS.SETTINGS, {}))
}

function saveSettings(patch) {
  const s = Object.assign(getSettings(), patch)
  set(KEYS.SETTINGS, s)
  return s
}

module.exports = {
  getProfile,
  saveProfile,
  getSessions,
  getSession,
  getActiveSession,
  createSession,
  switchSession,
  saveBaseline,
  updateSession,
  getTrainings,
  addTraining,
  computeVsBaseline,
  recomputeVsBaseline,
  getSettings,
  saveSettings
}
