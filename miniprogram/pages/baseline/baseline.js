// baseline.js — 基线测试页：9 次吹气采集 + 参考值判定 + 跳过
const store = require('../../utils/store')
const audio = require('../../utils/audio')
const params = require('../../utils/params')

const LEVELS = [
  { id: 'light', name: '轻轻吹', guide: '像吹蜡烛但不想灭它', reps: [] },
  { id: 'normal', name: '普通吹', guide: '正常力度呼气', reps: [] },
  { id: 'hard', name: '使劲吹', guide: '全力呼出，能吹多久吹多久', reps: [] }
]

Page({
  data: {
    phase: 'intro',            // intro | testing | result
    suggestBaseline: false,
    phaseText: '',
    refLevels: [],
    currentRound: 0,
    currentLevelName: '',
    currentRepIndex: 0,
    candleLevel: 0,
    currentDb: 0,
    blowing: false,
    mode: '',                  // blowing | countdown | idle
    countdown: 3,
    tipText: '',
    candles: [0, 1, 2, 3, 4],
    levelResults: [],
    overall: '',
    overallText: '',
    coachText: ''
  },

  onLoad(options) {
    this.sessionId = options.sessionId || (store.getActiveSession() || {}).id
    if (!this.sessionId) {
      const sess = store.createSession()
      this.sessionId = sess.id
    }

    const profile = store.getProfile() || {}
    const ref = params.buildReference(profile)
    this.ref = ref
    this.repData = { light: [], normal: [], hard: [] }
    this.round = 0
    this.breathStart = 0

    const suggestBaseline = profile.rehabPhase === 'postICU' || profile.rehabPhase === 'perioperative'
    const phaseText = { postICU: 'ICU 后康复', perioperative: '围手术期' }[profile.rehabPhase] || '康复期'

    this.setData({
      suggestBaseline,
      phaseText,
      refLevels: [
        { id: 'light', name: '轻轻吹', dbRange: ref.light.dbRange, durRange: ref.light.durRange },
        { id: 'normal', name: '普通吹', dbRange: ref.normal.dbRange, durRange: ref.normal.durRange },
        { id: 'hard', name: '使劲吹', dbRange: ref.hard.dbRange, durRange: ref.hard.durRange }
      ]
    })
  },

  onUnload() {
    audio.stop()
    if (this.countdownTimer) clearInterval(this.countdownTimer)
    if (this.restTimer) clearTimeout(this.restTimer)
  },

  // ===== 开始测试 =====
  startTest() {
    this.round = 0
    this.repData = { light: [], normal: [], hard: [] }
    this.setData({ phase: 'testing' })
    this.nextRound()
  },

  nextRound() {
    const levelIdx = Math.floor(this.round / 3)   // 每口气 3 次重复
    const repIdx = this.round % 3
    const level = LEVELS[levelIdx]
    if (!level) {
      this.finishTest()
      return
    }
    this.currentLevel = level
    this.setData({
      currentRound: this.round + 1,
      currentLevelName: level.name,
      currentRepIndex: repIdx + 1,
      tipText: '第 ' + (repIdx + 1) + ' 次：' + level.guide + '。准备好后点击"开始吹气"',
      mode: 'idle',
      currentDb: 0,
      candleLevel: 0
    })
  },

  // ===== 单次吹气 =====
  startBreath() {
    const that = this
    // 3 秒倒计时准备
    this.setData({ mode: 'countdown', countdown: 3, tipText: '准备…' })
    let n = 3
    this.countdownTimer = setInterval(() => {
      n--
      if (n <= 0) {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
        that.beginRecording()
      } else {
        that.setData({ countdown: n })
      }
    }, 1000)
  },

  beginRecording() {
    this.breathPeak = 0
    this.breathStart = Date.now()
    this.setData({ mode: 'blowing', blowing: true, tipText: '用力吹！' })
    audio.start({ duration: 20000 }, (db) => {
      const level = db >= 80 ? 3 : db >= 60 ? 2 : db >= 40 ? 1 : 0
      this.setData({ currentDb: db, candleLevel: level })
    }, (evt) => {
      if (evt.type === 'end') {
        this.onBreathEnd(evt)
      }
    })
  },

  stopBreath() {
    audio.stop()
  },

  onBreathEnd(evt) {
    if (this.data.mode !== 'blowing') return
    audio.stop()
    const level = this.currentLevel
    this.repData[level.id].push({ peakDb: evt.db, durationSec: evt.durationSec })
    this.setData({
      blowing: false,
      mode: 'idle',
      tipText: '本次：峰值 ' + evt.db + 'dB · ' + evt.durationSec + 's。休息 10 秒后继续…'
    })
    this.round++
    const that = this
    this.restTimer = setTimeout(() => {
      this.restTimer = null
      that.nextRound()
    }, 10000)
  },

  // ===== 结果计算 =====
  finishTest() {
    const results = {}
    LEVELS.forEach(l => {
      const reps = this.repData[l.id]
      const peakDbs = reps.map(r => r.peakDb)
      const durSecs = reps.map(r => r.durationSec)
      results[l.id] = {
        peakDb: Math.round(params.median(peakDbs)),
        durationSec: Math.round(params.median(durSecs) * 10) / 10,
        reps
      }
    })

    // 评分（相对参考区间）
    const scores = {}
    LEVELS.forEach(l => {
      const r = results[l.id]
      scores[l.id] = params.scoreLevel(r.peakDb, r.durationSec, this.ref[l.id])
    })
    const overall = params.gradeOverall(scores)

    const ratioText = id => {
      const r = results[id]
      const s = scores[id]
      if (s >= 0.66) return '高于参考'
      if (s >= 0.33) return '参考范围内'
      return '低于参考'
    }

    this.resultData = {
      version: 1,
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      levels: {
        light: results.light,
        normal: results.normal,
        hard: results.hard
      },
      overall
    }

    const overallText = { strong: '良好', medium: '中等', weak: '偏弱' }[overall]
    const coachText = this.buildCoach(overall, results)

    this.setData({
      phase: 'result',
      overall,
      overallText,
      coachText,
      levelResults: LEVELS.map(l => ({
        id: l.id,
        name: l.name,
        peakDb: results[l.id].peakDb,
        durationSec: results[l.id].durationSec,
        ratioText: ratioText(l.id)
      }))
    })
  },

  buildCoach(overall) {
    const name = store.getProfile() ? store.getProfile().name || '' : ''
    if (overall === 'weak') return (name ? name + '，' : '') + '您目前的第一口气（相对参考值）属于偏弱水平，建议从蜡烛模式开始，每日 3 次，循序渐进。'
    if (overall === 'medium') return (name ? name + '，' : '') + '当前属于中等水平，建议蜡烛 + 持久模式交替训练，每日 3-5 次。'
    return (name ? name + '，' : '') + '当前状态良好，建议持久模式巩固耐力，保持每日 3-5 次。'
  },

  finish() {
    store.saveBaseline(this.resultData)
    wx.reLaunch({ url: '/pages/index/index' })
  },

  retest() {
    this.startTest()
  },

  // ===== 跳过 =====
  skipTest() {
    wx.showModal({
      title: '跳过基线测试',
      content: '跳过后训练将不计算相对差值。可在"周期"页随时补测。确定跳过？',
      confirmText: '跳过',
      cancelText: '去测试',
      success: (res) => {
        if (res.confirm) {
          wx.reLaunch({ url: '/pages/index/index' })
        }
      }
    })
  }
})
