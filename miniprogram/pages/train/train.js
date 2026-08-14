// train.js — 训练页：4 种模式 + 蜡烛动画 + 结果计算
const store = require('../../utils/store')
const audio = require('../../utils/audio')
const params = require('../../utils/params')

const MODE_TEXT = {
  candle: '蜡烛模式',
  endurance: '持久模式',
  rhythm: '节奏模式',
  free: '自由模式'
}

Page({
  data: {
    mode: 'candle',
    modeText: '蜡烛模式',
    candles: [0, 1, 2, 3, 4],
    candleLevel: 0,
    currentDb: 0,
    elapsed: 0,
    peakDb: 0,
    activeSec: 0,
    breathCount: 0,
    rhythmText: '',
    finished: false,
    result: null,
    coachText: ''
  },

  onLoad(options) {
    this.mode = options.mode || 'candle'
    this.setData({
      mode: this.mode,
      modeText: MODE_TEXT[this.mode] || '自由模式',
      candles: this.mode === 'candle' ? [0, 1, 2, 3, 4] : [0]
    })

    this.breathEvents = []
    this.activeSecAccum = 0
    this.blowingSince = 0
    this.rhythmPhase = 'blow'   // rhythm 模式：blow | stop
    this.rhythmTimer = null
    this.elapsedTimer = null
    this.sessionStart = Date.now()
    audio.markSessionStart()

    this.beginRecording()
  },

  onUnload() {
    audio.stop()
    this.clearTimers()
  },

  beginRecording() {
    // 节奏模式：启动吹/停切换
    if (this.mode === 'rhythm') {
      this.startRhythm()
    }

    // 计时器
    this.elapsedTimer = setInterval(() => {
      this.setData({
        elapsed: Math.round((Date.now() - this.sessionStart) / 1000),
        activeSec: Math.round(this.activeSecAccum * 10) / 10
      })
    }, 1000)

    audio.start({ duration: 300000 }, (db) => {
      const level = db >= 80 ? 3 : db >= 60 ? 2 : db >= 40 ? 1 : 0
      this.setData({ currentDb: db, candleLevel: level })
      if (db > this.data.peakDb) this.setData({ peakDb: db })
    }, (evt) => {
      if (evt.type === 'end') {
        this.breathEvents.push(evt)
        this.activeSecAccum += evt.durationSec
        this.setData({ breathCount: this.breathEvents.length })
      }
    })
  },

  startRhythm() {
    const that = this
    const run = () => {
      if (this.mode !== 'rhythm') return
      if (this.rhythmPhase === 'blow') {
        this.rhythmPhase = 'stop'
        this.setData({ rhythmText: '▶ 吹！' })
        this.rhythmTimer = setTimeout(run, 6000)   // 吹 6 秒
      } else {
        this.rhythmPhase = 'blow'
        this.setData({ rhythmText: '⏸ 停！休息' })
        this.rhythmTimer = setTimeout(run, 3000)   // 停 3 秒
      }
    }
    this.setData({ rhythmText: '▶ 吹！' })
    this.rhythmPhase = 'stop'
    this.rhythmTimer = setTimeout(run, 6000)
  },

  clearTimers() {
    if (this.elapsedTimer) clearInterval(this.elapsedTimer)
    if (this.rhythmTimer) clearTimeout(this.rhythmTimer)
  },

  endTrain() {
    audio.stop()
    this.clearTimers()
    this.saveResult()
  },

  saveResult() {
    const session = store.getActiveSession()
    if (!session) {
      wx.showToast({ title: '无活跃周期', icon: 'none' })
      return
    }

    const record = {
      id: 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      sessionId: session.id,
      ts: new Date().toISOString(),
      mode: this.mode,
      peakDb: this.data.peakDb,
      durationSec: Math.round(this.data.activeSec * 10) / 10,
      stability: audio.stability() || 0,
      vsBaseline: null
    }
    record.vsBaseline = store.computeVsBaseline(record)

    store.addTraining(record)

    this.setData({
      finished: true,
      result: record,
      coachText: this.buildCoach(record)
    })
  },

  buildCoach(record) {
    const vs = record.vsBaseline
    if (!vs) return '本次训练已记录。建议尽快完成基线测试，以便跟踪相对进步。'
    if (vs.db >= 0 && vs.dur >= 0) return '本次峰值与时长均超过基线，进步明显，继续保持！'
    if (vs.db >= 0) return '峰值超过基线，但时长略短，注意呼气节奏，试试持久模式。'
    if (vs.dur >= 0) return '时长超过基线，但峰值略低，试试蜡烛模式提升力度。'
    return '本次略低于基线，注意休息，循序渐进，不必着急。'
  },

  saveAndHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  trainAgain() {
    this.setData({ finished: false, peakDb: 0, elapsed: 0, activeSec: 0, breathCount: 0, currentDb: 0, candleLevel: 0 })
    this.breathEvents = []
    this.activeSecAccum = 0
    this.sessionStart = Date.now()
    audio.markSessionStart()
    this.beginRecording()
  }
})
