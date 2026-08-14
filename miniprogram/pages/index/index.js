// index.js — 主页：今日状态 + 模式选择
const store = require('../../utils/store')

const MODES = [
  { id: 'candle', name: '蜡烛模式', emoji: '🕯️', desc: '吹灭5根蜡烛，练峰值力度' },
  { id: 'endurance', name: '持久模式', emoji: '🔥', desc: '保持火焰大摇，练呼吸耐力' },
  { id: 'rhythm', name: '节奏模式', emoji: '🎵', desc: '吹-停-吹-停，练呼吸控制' },
  { id: 'free', name: '自由模式', emoji: '🌬️', desc: '随便吹，记录数据' }
]

const PHASE_TEXT = {
  postICU: 'ICU 后康复',
  perioperative: '围手术期',
  chronic: '慢性康复',
  daily: '日常'
}

Page({
  data: {
    greeting: '',
    profile: null,
    activeSession: null,
    baselineLevelText: '',
    suggestBaseline: false,
    phaseText: '',
    modes: MODES
  },

  onShow() {
    // 兜底启动分流：若无档案/无周期，跳转对应页面
    const profile = store.getProfile()
    const active = store.getActiveSession()
    if (!profile) {
      wx.reLaunch({ url: '/pages/profile/profile' })
      return
    }
    if (!active) {
      const sess = store.createSession()
      wx.navigateTo({ url: '/pages/baseline/baseline?sessionId=' + sess.id })
      return
    }
    this.loadData()
  },

  loadData() {
    const profile = store.getProfile()
    const active = store.getActiveSession()

    const hour = new Date().getHours()
    let greeting = '你好'
    if (hour < 6) greeting = '夜深了'
    else if (hour < 12) greeting = '早上好'
    else if (hour < 14) greeting = '中午好'
    else if (hour < 19) greeting = '下午好'
    else greeting = '晚上好'

    let profileText = ''
    if (profile) {
      profileText = [profile.role === 'patient' ? '病人' : '健康人', profile.age + '岁', profile.gender === 'female' ? '女' : '男'].join(' · ')
    }

    let baselineLevelText = ''
    if (active && active.baseline) {
      const map = { weak: '偏弱', medium: '中等', strong: '良好' }
      baselineLevelText = map[active.baseline.overall] || ''
    }

    const suggestBaseline = active && profile && (profile.rehabPhase === 'postICU' || profile.rehabPhase === 'perioperative')

    this.setData({
      greeting,
      profile,
      profileText,
      activeSession: active,
      baselineLevelText,
      suggestBaseline,
      phaseText: active && profile ? (PHASE_TEXT[profile.rehabPhase] || '康复期') : ''
    })
  },

  startTrain(e) {
    const mode = e.currentTarget.dataset.mode
    if (!store.getActiveSession()) {
      store.createSession()
    }
    wx.navigateTo({ url: '/pages/train/train?mode=' + mode })
  },

  goBaseline() {
    wx.navigateTo({ url: '/pages/baseline/baseline' })
  }
})
