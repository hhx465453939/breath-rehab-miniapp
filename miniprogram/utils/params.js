// params.js — 全局参数：参考值规则表 + 阈值 + 判定

// 阈值（dB）：分贝 > thresholdDb 视为有效吹气
const THRESHOLD_DB = 50

// 蜡烛档位
const CANDLE_LEVELS = [
  { max: 40, level: 0, text: '安静' },
  { max: 60, level: 1, text: '微摇' },
  { max: 80, level: 2, text: '大摇' },
  { max: 100, level: 3, text: '灭1根' },
  { max: 999, level: 4, text: '全灭' }
]

// 相对自身参考值规则表（经验值，非医学标准）
// 输入：档案 → 输出三档 {light, normal, hard} 的 {dbRange, durRange}
// 年龄分层 × 身份 × 康复阶段调整
function buildReference(profile) {
  const age = profile.age || 63
  const isPatient = profile.role === 'patient'
  const phase = profile.rehabPhase || 'daily'

  // 基础区间（健康人基准）
  let ref = {
    light: { dbRange: [45, 65], durRange: [1.5, 4] },
    normal: { dbRange: [60, 80], durRange: [2.5, 6] },
    hard: { dbRange: [70, 95], durRange: [3.5, 8] }
  }

  // 年龄调整：每 10 岁从 60 岁起 -2dB、-0.5s（保守递减）
  if (age > 60) {
    const years = age - 60
    const dbAdj = Math.round(years / 10) * 2
    const durAdj = Math.round(years / 10) * 0.5
    ref = shiftRef(ref, -dbAdj, -durAdj)
  } else if (age < 40) {
    ref = shiftRef(ref, +2, +0.5)
  }

  // 病人调整：-8dB、-2s
  if (isPatient) {
    ref = shiftRef(ref, -8, -2)
  }

  // 康复阶段调整：术后/ICU 后额外 -5dB、-1s
  if (phase === 'postICU' || phase === 'perioperative') {
    ref = shiftRef(ref, -5, -1)
  } else if (phase === 'chronic') {
    ref = shiftRef(ref, -3, -0.5)
  }

  return ref
}

function shiftRef(ref, dbAdj, durAdj) {
  const out = {}
  for (const k of ['light', 'normal', 'hard']) {
    out[k] = {
      dbRange: [ref[k].dbRange[0] + dbAdj, ref[k].dbRange[1] + dbAdj],
      durRange: [Math.max(0.5, ref[k].durRange[0] + durAdj), Math.max(1, ref[k].durRange[1] + durAdj)]
    }
  }
  return out
}

// 综合评级：强/中/弱
function gradeOverall(scores) {
  // scores: {light, normal, hard} 各 0-1
  const score = 0.6 * scores.hard + 0.25 * scores.normal + 0.15 * scores.light
  if (score >= 0.66) return 'strong'
  if (score >= 0.33) return 'medium'
  return 'weak'
}

// 单口气评分：实测中位数相对参考区间的位置（0-1）
function scoreLevel(medianDb, medianDur, refLevel) {
  const dbRange = refLevel.dbRange
  const durRange = refLevel.durRange
  const dbRatio = clamp((medianDb - dbRange[0]) / (dbRange[1] - dbRange[0]), 0, 1)
  const durRatio = clamp((medianDur - durRange[0]) / (durRange[1] - durRange[0]), 0, 1)
  return 0.7 * dbRatio + 0.3 * durRatio
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// 中位数
function median(arr) {
  if (!arr || !arr.length) return 0
  const sorted = arr.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

module.exports = {
  THRESHOLD_DB,
  CANDLE_LEVELS,
  buildReference,
  gradeOverall,
  scoreLevel,
  median,
  clamp
}
