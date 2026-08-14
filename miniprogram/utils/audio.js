// audio.js — RecorderManager 封装：实时分贝 + 吹气事件
const params = require('./params')

const recorder = wx.getRecorderManager()

let frameHandler = null      // 每帧回调 (db)
let breathHandler = null     // 吹气事件回调 {type:'start'|'end', db, durationSec}
let recording = false
let aboveThreshold = false
let breathStartTime = 0
let breathPeak = 0
let dbSamples = []           // 本次会话所有 db 采样（计算稳定性）

// 打开监听（需用户授权后调用）
function start(options, onFrame, onBreath) {
  frameHandler = onFrame
  breathHandler = onBreath
  dbSamples = []
  aboveThreshold = false

  recorder.onFrameRecorded(onFrameRecorded)
  recorder.onStop(onStop)

  recorder.start({
    duration: options.duration || 300000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 48000,
    format: 'pcm',
    frameSize: 5
  })
  recording = true
}

function onFrameRecorded(res) {
  if (!recording) return
  const data = new Int16Array(res.frameBuffer)
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i]
  }
  const rms = Math.sqrt(sum / data.length)
  // 经验换算：0-120dB 量程
  let db = 20 * Math.log10(rms / 32767) + 90
  if (db < 0) db = 0
  if (db > 120) db = 120

  dbSamples.push(db)

  // 吹气事件判定（阈值）
  const threshold = params.THRESHOLD_DB
  const now = Date.now()
  if (!aboveThreshold && db >= threshold) {
    aboveThreshold = true
    breathStartTime = now
    breathPeak = db
    if (breathHandler) breathHandler({ type: 'start', db, ts: now })
  } else if (aboveThreshold) {
    if (db > breathPeak) breathPeak = db
    if (db < threshold - 5) {
      // 低于阈值 5dB 判定吹气结束（防抖动）
      aboveThreshold = false
      const durationSec = Math.round((now - breathStartTime) / 100) / 10
      if (breathHandler) breathHandler({ type: 'end', db: Math.round(breathPeak), durationSec, ts: now })
    }
  }

  if (frameHandler) frameHandler(Math.round(db))
}

function onStop() {
  recording = false
  if (aboveThreshold && breathHandler) {
    const durationSec = Math.round((Date.now() - breathStartTime) / 100) / 10
    breathHandler({ type: 'end', db: Math.round(breathPeak), durationSec, ts: Date.now() })
  }
  aboveThreshold = false
  frameHandler = null
  breathHandler = null
}

function stop() {
  if (recording) {
    recording = false
    recorder.stop()
  }
}

// 稳定性：标准差/均值（0-1，越小越稳定）
function stability() {
  if (dbSamples.length < 10) return null
  const mean = dbSamples.reduce((a, b) => a + b, 0) / dbSamples.length
  if (mean === 0) return 0
  const variance = dbSamples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / dbSamples.length
  const std = Math.sqrt(variance)
  return Math.round((std / mean) * 100) / 100
}

// 峰值分贝（整段会话）
function peakDb() {
  return dbSamples.length ? Math.round(Math.max.apply(null, dbSamples)) : 0
}

// 有效吹气累计时长（dB ≥ 阈值的采样帧数 × 帧时长）
function activeDurationSec() {
  if (!dbSamples.length) return 0
  // 每帧约 40ms（5KB @ 16kHz 16bit = 2.5ms/KB → 帧长 = 5*2.5 = 12.5ms？实际按帧计数估算）
  // 更稳妥：基于吹气事件累加（在事件回调中计算），此处返回估计值
  const over = dbSamples.filter(d => d >= params.THRESHOLD_DB).length
  return Math.round((over / dbSamples.length) * estimateElapsed()) 
}

// 会话总时长估计（由调用方传入开始时间）
let sessionStart = 0
function markSessionStart() { sessionStart = Date.now() }
function estimateElapsed() { return (Date.now() - sessionStart) / 1000 }

module.exports = {
  start,
  stop,
  stability,
  peakDb,
  activeDurationSec,
  markSessionStart,
  estimateElapsed
}
