// history.js — 历史页：列表 + 折线图 + 当日总结 + 周期筛选
const store = require('../../utils/store')
const coach = require('../../utils/coach')

const MODE_TEXT = {
  candle: '蜡烛模式',
  endurance: '持久模式',
  rhythm: '节奏模式',
  free: '自由模式'
}

Page({
  data: {
    sessionOptions: [{ id: null, title: '全部周期' }],
    sessionIndex: 0,
    records: [],
    hasData: false,
    totalCount: 0,
    avgPeak: 0,
    todayCount: 0,
    streak: 0,
    todaySummary: ''
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const sessions = store.getSessions()
    const options = [{ id: null, title: '全部周期' }].concat(sessions.map(s => ({ id: s.id, title: s.title })))
    const activeId = store.getActiveSession() ? store.getActiveSession().id : null
    let idx = this.data.sessionIndex
    // 校验当前筛选是否仍有效
    if (idx >= options.length) idx = 0

    const all = store.getTrainings()
    const filterId = options[idx] ? options[idx].id : null
    const filtered = filterId ? all.filter(t => t.sessionId === filterId) : all

    const records = filtered.slice().reverse().map(t => ({
      id: t.id,
      modeText: MODE_TEXT[t.mode] || t.mode,
      dateText: fmtDate(t.ts),
      timeText: fmtTime(t.ts),
      peakDb: t.peakDb,
      durationSec: t.durationSec,
      stability: t.stability,
      vsBaseline: t.vsBaseline
    }))

    const hasData = records.length > 0
    const peaks = records.map(r => r.peakDb)
    const avgPeak = peaks.length ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length) : 0
    const today = fmtDate(new Date().toISOString())
    const todayCount = filtered.filter(t => fmtDate(t.ts) === today).length
    const streak = calcStreak(filtered)

    this.setData({
      sessionOptions: options,
      sessionIndex: idx,
      records,
      hasData,
      totalCount: filtered.length,
      avgPeak,
      todayCount,
      streak,
      todaySummary: hasData ? coach.dailySummary(filtered, activeId) : ''
    })

    if (hasData) {
      this.drawChart(filtered.slice(-30).reverse())
    }
  },

  onSessionChange(e) {
    this.setData({ sessionIndex: parseInt(e.detail.value, 10) })
    this.loadData()
  },

  drawChart(data) {
    const query = wx.createSelectorQuery().in(this)
    query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio
      canvas.width = res[0].width * dpr
      canvas.height = res[0].height * dpr
      ctx.scale(dpr, dpr)

      const W = res[0].width
      const H = res[0].height
      ctx.clearRect(0, 0, W, H)

      const values = data.map(d => d.peakDb)
      const max = Math.max.apply(null, values.concat([80]))
      const min = Math.max(0, Math.min.apply(null, values) - 10)
      const n = values.length

      // 网格
      ctx.strokeStyle = '#F2C492'
      ctx.lineWidth = 1
      for (let i = 0; i <= 4; i++) {
        const y = H - 10 - (H - 20) * i / 4
        ctx.beginPath()
        ctx.moveTo(30, y)
        ctx.lineTo(W - 10, y)
        ctx.stroke()
        ctx.fillStyle = '#99A9B7'
        ctx.font = '10px sans-serif'
        ctx.fillText(Math.round(min + (max - min) * i / 4), 2, y + 3)
      }

      // 折线
      ctx.beginPath()
      ctx.strokeStyle = '#DD7180'
      ctx.lineWidth = 2
      const px = i => (n === 1 ? W / 2 : 30 + (W - 40) * i / (n - 1))
      const py = v => H - 10 - (H - 20) * (v - min) / (max - min)
      values.forEach((v, i) => {
        if (i === 0) ctx.moveTo(px(i), py(v))
        else ctx.lineTo(px(i), py(v))
      })
      ctx.stroke()

      // 数据点
      ctx.fillStyle = '#59455A'
      values.forEach((v, i) => {
        ctx.beginPath()
        ctx.arc(px(i), py(v), 3, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  }
})

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = n => (n < 10 ? '0' + n : n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = n => (n < 10 ? '0' + n : n)
  return p(d.getHours()) + ':' + p(d.getMinutes())
}

function calcStreak(list) {
  if (!list.length) return 0
  const days = new Set(list.map(t => fmtDate(t.ts)))
  let streak = 0
  const d = new Date()
  while (true) {
    const key = fmtDate(d.toISOString())
    if (days.has(key)) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}
