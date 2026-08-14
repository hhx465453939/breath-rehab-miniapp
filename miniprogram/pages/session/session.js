// session.js — 康复周期管理页
const store = require('../../utils/store')

Page({
  data: {
    sessions: []
  },

  onShow() {
    this.loadSessions()
  },

  loadSessions() {
    const list = store.getSessions().map(s => {
      const p = s.profileSnapshot || {}
      const parts = []
      if (p.role) parts.push(p.role === 'patient' ? '病人' : '健康人')
      if (p.age) parts.push(p.age + '岁')
      if (p.gender) parts.push(p.gender === 'female' ? '女' : '男')
      return {
        id: s.id,
        title: s.title,
        note: s.note || '',
        status: s.status,
        baseline: s.baseline,
        dateText: fmtDate(s.createdAt),
        profileText: parts.join(' · '),
        baselineCount: s.baselineHistory ? s.baselineHistory.length + (s.baseline ? 1 : 0) : (s.baseline ? 1 : 0)
      }
    }).reverse()
    this.setData({ sessions: list })
  },

  onNewSession() {
    const sess = store.createSession()
    wx.showToast({ title: '已创建「' + sess.title + '」', icon: 'none' })
    wx.navigateTo({ url: '/pages/baseline/baseline?sessionId=' + sess.id })
  },

  onSwitch(e) {
    const id = e.currentTarget.dataset.id
    const s = store.getSession(id)
    if (s.status === 'active') return
    store.switchSession(id)
    this.loadSessions()
    wx.showToast({ title: '已切换周期', icon: 'none' })
  },

  onRetestBaseline(e) {
    const id = e.currentTarget.dataset.id
    store.switchSession(id)
    wx.navigateTo({ url: '/pages/baseline/baseline?sessionId=' + id })
  }
})

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = n => (n < 10 ? '0' + n : n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
