// coach.js — 循证指导话术（趋势对比 + 鼓励 + 就医提醒，无诊断语句）
const store = require('./store')

const PHASE_TEXT = {
  postICU: 'ICU 后康复',
  perioperative: '围手术期',
  chronic: '慢性康复',
  daily: '日常'
}

// 每日总结：对比昨天、对比基线、依从性
function dailySummary(trainings, activeSessionId) {
  if (!trainings || !trainings.length) return '今日暂无训练记录。建议每日 3-5 次，循序渐进。'

  const today = fmtDate(new Date(Date.now()))
  const yday = fmtDate(new Date(Date.now() - 86400000))
  const todays = trainings.filter(t => fmtDate(t.ts) === today)
  const ydays = trainings.filter(t => fmtDate(t.ts) === yday)

  const todayPeak = maxDb(todays)
  const ydayPeak = maxDb(ydays)
  const parts = []

  if (todays.length === 0) {
    parts.push('今日尚未训练，别忘了完成今天的 3-5 次训练哦。')
    return parts.join('')
  }

  // 依从性
  if (todays.length >= 3) parts.push('今日已完成 ' + todays.length + ' 次训练，达标！')
  else parts.push('今日完成 ' + todays.length + ' 次，目标每日 3-5 次。')

  // 与昨天对比
  if (ydayPeak > 0) {
    if (todayPeak >= ydayPeak) parts.push('比昨天峰值' + (todayPeak - ydayPeak >= 0 ? '进步' : '持平') + '（' + todayPeak + ' vs ' + ydayPeak + ' dB）')
    else parts.push('今日峰值略低于昨天，注意休息，不必着急。')
  }

  // 与基线对比（当前周期）
  const active = store.getSession(activeSessionId)
  if (active && active.baseline && active.baseline.levels && active.baseline.levels.normal) {
    const baseDb = active.baseline.levels.normal.peakDb
    if (todayPeak >= baseDb) parts.push('峰值在基线之上（+' + (todayPeak - baseDb) + ' dB）')
    else parts.push('峰值略低于基线（-' + (baseDb - todayPeak) + ' dB），循序渐进')
  }

  // 连续 3 天退步提醒（非诊断）
  const recent = trainings.slice(-6)
  if (recent.length >= 3) {
    const last3 = recent.slice(-3).map(t => t.peakDb)
    const prev = recent.slice(0, -3).map(t => t.peakDb)
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
    if (last3.length === 3 && prev.length && avg(last3) < avg(prev) * 0.9) {
      parts.push('近期趋势有所回落，建议咨询主治医生（非诊断提醒）。')
    }
  }

  return parts.join('')
}

function maxDb(list) {
  return list.length ? Math.max.apply(null, list.map(t => t.peakDb)) : 0
}

function fmtDate(iso) {
  const d = new Date(iso)
  const p = n => (n < 10 ? '0' + n : n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

module.exports = {
  dailySummary
}
