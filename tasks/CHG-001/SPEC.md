---
change_id: CHG-001
version: 1
status: draft
prd_ref: PRD.md v1.0
health_ref: null（全新项目，无既有代码基线）
supersedes: null
approved_by: null
approved_at: null
---

> **设计决策已确认**（用户 2026-08-14，PRD §8 D1-D6）：Session 制康复周期 + 相对自身参考值判定 + 基线可跳过 + 统一话术 + 安卓优先。
> 状态仍为 draft，待用户对本文档整体点头后置为 approved。

# SPEC.md — 呼吸康复吹气训练小程序 · 工程规格

## 1. 背景、目标、非目标

见 `CHANGE.md`（§1-§5）。摘要：
- 为用户构建个人自用的微信小程序体验版，2-3 天上线。
- 核心新增：用户档案 + 首次三口气基线测试 + 循证趋势指导。
- 无后端，全本地存储，非医疗器械定位。

## 2. 当前架构与债务影响

无既有代码（greenfield）。无需迁移，无技术债。飞书康复方案文档（docs/feishu-refs/）作为循证话术依据源。

## 3. 选定设计与 ADR

### ADR-001：技术栈选择

| 项 | 选定 | 备选 | 理由 |
|----|------|------|------|
| 框架 | 原生小程序 | Taro/uni-app | 原生最简单，零构建，2-3 天目标 |
| 录音 | RecorderManager + onFrameRecorded | wx.getAudioContext | 官方 API，PCM 帧可实时算分贝 |
| 存储 | wx.setStorageSync | 云开发 | 无后端目标，本地最简 |
| 图表 | wx-canvas 自绘 | echarts 小程序版 | 免依赖，折线图简单可自绘 |

### ADR-002：分贝换算方案

- 选定：`db = 20*log10(rms/32767) + 90` 经验公式（原 PRD）。
- 理由：无需标定即可获得**相对**强度，满足"前后对比 + 蜡烛动画"需求。
- 影响：不做绝对 dB 声称；基线在固定设备建立。
- 可逆性：高（换算函数单点可改）。

### ADR-003：基线"强/中/弱"判定 + 康复周期 Session

- **判定**（v1）：基于**相对自身参考值**——由档案规则表（`utils/params.js`）按年龄分层 × 状态调整（健康人/病人、康复阶段、原发病）生成"轻/普通/劲"三档参考区间；实测中位数落入参考区间的相对位置 → 强 / 中 / 弱 三分位。
- **康复周期 Session 制**（用户确认 D5）：可多次新建周期；每个周期**重新录制基线**；训练记录挂载到 Session 并记录相对当前周期基线的差值。
- 备选：GLI-2012 正式分层方程——v2 引入（需标定），v1 不做以免误导。
- 理由：无标定数据下绝对值分层不科学；相对判定 + 免责话术最稳妥。
- 可逆性：高。

### ADR-004：训练与基线的关系

- 每次训练结束保存记录，挂载当前 `activeSessionId`，并写入 `vsBaseline`（与当前 Session 基线快照的差值）。
- 当前 Session 无基线（跳过）时 `vsBaseline = null`，补录基线后**追溯补算**历史记录的差值。
- 基线可"重新测试"更新（Session 内覆盖式快照，旧快照入 `baselineHistory`）。
- 理由：康复过程基线会提升，需支持周期内重测与跨周期重建。

### ADR-005：基线跳过策略（用户确认 D2）

- 极限测试允许跳过；若档案 `rehabPhase` ∈ {postICU, perioperative}，基线页与训练页显示"建议先完成基线"提示。
- 跳过不阻塞训练；训练页常驻"未测基线"提示 + 补测入口。

## 4. 接口、数据、安全、兼容、可观测

### 4.1 页面路由

```
pages/profile（档案，首次必填）
  → pages/session（康复周期：列表/新建/基线重录入口）
    → pages/baseline（基线测试，可跳过）
      → pages/index（主页/模式选择）
        → pages/train?mode=candle|endurance|rhythm|free
        → pages/history
```

启动分流（app.js onLaunch / index onLoad 判断）：
- 无 profile → 跳 profile
- 有 profile、无任何 session → 自动创建 Session 1 → 跳 baseline（可跳过）
- 当前 session 无 baseline → 训练页显示"建议补测"提示（可跳过）
- 其余 → index

### 4.2 本地存储契约（wx.setStorageSync key）

| Key | 结构 | 说明 |
|-----|------|------|
| `profile` | `{name, role, age, gender, diseases[], surgery{done,type,time}, icu{admitted,duration,extubated}, rehabPhase, createdAt}` | 档案 |
| `sessions` | `[{id, createdAt, title, note, profileSnapshot, baseline, baselineHistory[], status}]` | 康复周期数组 |
| `activeSessionId` | `string` | 当前活跃周期 ID |
| `trainings` | `[{id, sessionId, ts, mode, peakDb, durationSec, stability, vsBaseline}]` | 训练记录数组 |
| `settings` | `{thresholdDb:50, micDistance:'15-20cm'}` | 设置 |

- 每个 Session 的 `baseline` 独立：**新周期必须重录基线**。
- `profileSnapshot`：建立周期时的档案快照（含原发病/手术/ICU/康复阶段），随周期存档。
- Session 的 `baseline` 可为 `null`（跳过基线），补录后写入并追溯补算 `trainings` 中该 sessionId 记录的 `vsBaseline`。
- levels 单口气结构：`{peakDb, durationSec, reps:[db,db,db]}`（reps 为中位数来源，重测覆盖）。

### 4.3 基线判定算法（v1 · 相对自身参考值）

```
参考值规则表（utils/params.js）：
  按 年龄分层(≤40 / 41-60 / ≥61) × 身份(healthy/patient) × 康复阶段调整
  输出三档参考区间：light / normal / hard 的 {dbRange, durationRange}
  示例：63岁女患者 postICU → hard 参考 65-85dB、3-6s

对每口气（light/normal/hard）：
  peakDb_med = median(reps.db)        # 3 次中位数
  dur_med    = median(reps.durationSec)

档位得分（相对参考区间）：
  dbRatio   = clamp((peakDb_med - dbRange.low) / (dbRange.high - dbRange.low), 0, 1)
  durRatio  = clamp((dur_med - durRange.low) / (durRange.high - durRange.low), 0, 1)
  levelScore_i = 0.7 * dbRatio + 0.3 * durRatio

综合评分：
  score = 0.6 * levelScore(hard) + 0.25 * levelScore(normal) + 0.15 * levelScore(light)

overall = score ≥ 0.66 ? 'strong' : score ≥ 0.33 ? 'medium' : 'weak'
```

> 参考区间为**经验规则表**（非临床标准），页面标注"参考区间为经验值，非医学标准"。参数集中 `utils/params.js`，真机实测后可调。GLI-2012 分层留 v2。

### 4.4 训练结果计算

- peakDb：一次训练会话内所有吹气事件（≥阈值 50dB）中最高分贝
- durationSec：总"有效吹气时长"（分贝 ≥ 阈值累计秒数）
- stability：`stddev(db_samples)/mean(db_samples)`（0-1 区间）
- vsBaseline：与 baseline.levels.normal 比较（模式相关：candle/rhythm 对比峰值，endurance 对比时长，free 全对比）

### 4.5 循证指导话术（结果页）

| 情境 | 话术（示例，非医学诊断） |
|------|--------------------------|
| 首次判定 weak | "您目前的第一口气属于偏弱水平，建议从蜡烛模式开始，每日 3 次" |
| 首次判定 medium | "当前属于中等水平，建议蜡烛 + 持久模式交替" |
| 首次判定 strong | "当前状态良好，建议持久模式巩固耐力" |
| 今日 ≥ 昨日 | "今天比昨天进步了，继续保持！" |
| 今日 < 昨日但 ≥ 基线 | "今天略有回落，但仍在基线之上，注意休息" |
| 连续 3 天 < 基线 | "近期趋势回落，建议咨询主治医生（非诊断提醒）" |
| 依从性达标（≥3 次/日） | "今日已完成 X 次训练，达标！" |

话术集中 `utils/coach.js`，全部为"趋势对比 + 鼓励 + 就医提醒"，无诊断语句。

### 4.6 安全与合规

- 录音权限：首次请求时弹窗文案明确"录音仅在手机本地实时计算，不上传不保存音频"。
- 所有测量结果页固定展示免责声明：**"本工具非医疗器械，测量值仅供参考，不做医学诊断。请遵医嘱。"**
- 无网络请求代码（零外传）。

### 4.7 兼容性

- 基础库：≥ 2.10.0（RecorderManager onFrameRecorded 支持）
- 真机验证：至少 1 台安卓 + 1 台 iOS
- 分贝计算仅依赖 PCM 帧，16kHz/48kbps 参数，低端机可降 frameSize

### 4.8 失败/降级模式

| 场景 | 行为 |
|------|------|
| 录音权限拒绝 | 引导页说明 + 重试按钮；不崩溃 |
| 麦克风无声音 | 训练开始 5s 无信号 → 提示"未检测到声音，请靠近麦克风 15-20cm" |
| onFrameRecorded 延迟 | UI 节流 100ms 更新，不影响计算 |
| 存储满 | trainings 超 500 条自动归档最旧 100 条 |
| 中断退出 | 保存已完成的吹气事件，训练标记 interrupted |

## 5. 里程碑（依赖排序）

| 里程碑 | 依赖 | 内容 | 验收 | 检查命令 |
|--------|------|------|------|---------|
| M1 工程骨架 | 无 | 测试号项目 + 6 页面路由（含 session）+ tabBar/入口 | 编译通过，页面跳转正常 | 微信开发者工具编译 |
| M2 档案页 | M1 | profile 表单 + 校验 + 存储 | 建档后启动分流跳 session/baseline | 开发者工具模拟 |
| M3 分贝引擎 | M1 | recorder 封装 + RMS→dB + 阈值事件 | 控制台输出正确 dB 序列 | 开发者工具真机模拟器 |
| M4 周期+基线 | M2+M3 | session 管理（新建/快照/重录）+ baseline 9 次吹气 + 参考值判定 + 跳过逻辑 + 追溯补算 | 新建周期重录基线；跳过可用；补录后追溯补算 vsBaseline | 真机 |
| M5 训练页 | M3 | 蜡烛动画 5 档 + 4 模式逻辑 + 结果计算（挂 sessionId） | 模式完成出结果卡片 + vsBaseline 正确 | 真机 |
| M6 历史页 | M5 | 列表 + wx-canvas 折线图 + 当日总结 + 周期筛选 | 记录可见 + 趋势线正确 | 真机 |
| M7 循证指导 | M5 | coach.js 话术 + 免责声明展示 + 未测基线提示 | 结果页话术正确 | 真机 |
| M8 体验版发布 | 全部 | 上传体验版 + 添加微信号（安卓优先验证） | 真机完整流程 3 遍通过 | 微信后台 |

## 6. 定义就绪（DoR）/ 完成（DoD）

**DoR（进入开发）**：
- [x] PRD v1.0 经用户确认（决策记录 D1-D6，2026-08-14）
- [ ] 微信开发者工具可用 + 测试号创建

**DoD（CHG-001 完成）**：
- [ ] M1-M8 全部验收通过
- [ ] 安卓真机完整流程 3 遍无阻断（iOS 视差异后补）
- [ ] 免责声明与权限文案在所有测量页面展示
- [ ] 代码 git 提交 + 推送到用户个人公开仓库

## 7. 审查与交付 Gate

| Gate | 内容 | 触发人 |
|------|------|--------|
| G1 设计确认 | ADR-003/004/005（Session 制 + 参考值判定）已确认 | 用户（D1-D6） |
| G2 里程碑评审 | M4（周期+基线）真机效果确认 | 用户 |
| G3 验收 | M8 前整体验收 | 用户 |
| G4 提交授权 | 代码提交个人仓库（**分开授权**） | 用户 |
| G5 推送授权 | push 到 GitHub public 仓库（**分开授权**） | 用户 |

> 提交与推送为独立授权点，默认不自动执行。

## 8. 可追溯性

见 `TRACEABILITY.md`。

## 9. 已确认决策（用户 2026-08-14）

| # | 问题 | 决策 |
|---|------|------|
| Q1 | 基线判定规则 | D1：相对自身参考值（档案规则表），GLI 留 v2 |
| Q2 | 基线可跳过 | D2：允许跳过；围手术期/ICU 后建议完成 + 补测入口 |
| Q3 | 健康人/病人话术 | D3：v1 统一话术 |
| Q4 | 真机范围 | D4：先安卓 |
| Q5 | 周期管理 | D5：Session 制，每周期重录基线 |
| Q6 | 档案字段 | D6：原发病/手术/ICU/康复阶段，随周期快照 |
