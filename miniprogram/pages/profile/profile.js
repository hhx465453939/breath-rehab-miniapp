// profile.js — 用户档案页（首次必填）
const store = require('../../utils/store')

Page({
  data: {
    form: {
      name: '',
      role: 'patient',
      age: '',
      gender: 'female',
      diseases: [],
      diseaseOther: '',
      surgery: { done: false, time: '' },
      icu: { admitted: false, duration: '', extubated: false },
      rehabPhase: 'postICU'
    }
  },

  onLoad() {
    const profile = store.getProfile()
    if (profile) {
      this.setData({ form: Object.assign({}, this.data.form, profile) })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const val = e.detail.value
    if (field === 'surgeryTime') {
      this.setData({ 'form.surgery.time': val })
    } else if (field === 'icuDuration') {
      this.setData({ 'form.icu.duration': val })
    } else {
      this.setData({ ['form.' + field]: val })
    }
  },

  onRole(e) {
    this.setData({ 'form.role': e.currentTarget.dataset.role })
  },

  onGender(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.gender })
  },

  onDisease(e) {
    const d = e.currentTarget.dataset.d
    const list = this.data.form.diseases.slice()
    const i = list.indexOf(d)
    if (i > -1) list.splice(i, 1)
    else list.push(d)
    this.setData({ 'form.diseases': list })
  },

  onSurgery(e) {
    this.setData({ 'form.surgery.done': e.currentTarget.dataset.v === '1' })
  },

  onIcu(e) {
    this.setData({ 'form.icu.admitted': e.currentTarget.dataset.v === '1' })
  },

  onExtubated(e) {
    this.setData({ 'form.icu.extubated': e.currentTarget.dataset.v === '1' })
  },

  onPhase(e) {
    this.setData({ 'form.rehabPhase': e.currentTarget.dataset.p })
  },

  onSave() {
    const f = this.data.form
    if (!f.name.trim()) return this.toast('请填写称呼')
    if (!f.age) return this.toast('请填写年龄')
    const age = parseInt(f.age, 10)
    if (isNaN(age) || age < 1 || age > 120) return this.toast('年龄无效')

    const diseases = f.diseases.slice()
    if (f.diseaseOther.trim()) {
      f.diseaseOther.trim().split(/[,，、]/).forEach(d => {
        if (d && diseases.indexOf(d) === -1) diseases.push(d)
      })
    }

    const profile = {
      name: f.name.trim(),
      role: f.role,
      age,
      gender: f.gender,
      diseases,
      surgery: { done: f.surgery.done, time: f.surgery.done ? f.surgery.time : '' },
      icu: { admitted: f.icu.admitted, duration: f.icu.admitted ? f.icu.duration : '', extubated: f.icu.admitted ? f.icu.extubated : false },
      rehabPhase: f.rehabPhase,
      createdAt: store.getProfile() ? store.getProfile().createdAt : new Date().toISOString()
    }

    store.saveProfile(profile)

    // 分流：建档后自动创建 Session 1 → 基线（可跳过）
    const active = store.getActiveSession()
    if (!active) {
      const sess = store.createSession()
      wx.reLaunch({ url: '/pages/baseline/baseline?sessionId=' + sess.id })
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  toast(msg) {
    wx.showToast({ title: msg, icon: 'none' })
  }
})
