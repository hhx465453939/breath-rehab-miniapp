// app.js — 启动分流：profile → session/baseline → index
const store = require('./utils/store')

App({
  globalData: {
    profile: null,
    activeSession: null
  },

  onLaunch() {
    this.bootstrap()
  },

  // 启动分流逻辑（在页面 onShow 也可调用，处理数据变化）
  bootstrap() {
    const profile = store.getProfile()
    this.globalData.profile = profile

    if (!profile) {
      // 无档案 → 档案页（首次必填）
      wx.reLaunch({ url: '/pages/profile/profile' })
      return
    }

    const active = store.getActiveSession()
    this.globalData.activeSession = active

    if (!active) {
      // 有档案、无 Session → 自动创建 Session 1 → 基线（可跳过）
      const sess = store.createSession()
      this.globalData.activeSession = sess
      wx.reLaunch({ url: '/pages/baseline/baseline' })
      return
    }

    // 正常 → 主页（训练页自行判断补测提示）
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
