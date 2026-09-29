# 敌方预告回合（US-006）Cocos 落地方案

状态：已实现（本文件记录实现要点与验证方式）
来源合同：`preview/docs/us/US-006-enemy-telegraph-turn-loop.md`
关联：`docs/architecture/adr-0001-pure-ts-core.md`（纯 TS Core / 哑视图 / 薄协调者）

## 1. 回合合同（实现口径）

每轮流程恒定：

1. **敌方准备**（`enemyPrep`）：按出生序逐敌至多一次普通移动（已有合法攻击则原地），
   逐个使用实时占位（不叠子）；准备移动不扣体力；
2. **意图冻结**：全部准备完成后按最终局面为每敌冻结至多一个攻击意图（无合法攻击 → 待机）；
3. **玩家行动**（`playerTurn`）：意图不重新生成，只随局面刷新预测；
4. **敌方执行**（`enemyAttack`）：玩家结束回合后按冻结顺序逐个执行；
5. 结算完毕 `round+1` 回到准备。`turn.active` 恒为我方（不再轮换）。

### 关键语义

- **相对位移锁定**：意图保存 `offset = 冻结落点 − 冻结时位置`；结算/预测目标格 =
  攻击者当前位置 + `offset`。不追踪受害者、不回打绝对格、不换目标。
- **执行时重验**：越界 / 炮架≠1 / 马腿 / 宫界 / 地形 / 攻击形状按当前局面重验；
  失效不另选动作（原因可读）；攻击者阵亡 → 跳过不重排；
  我方帅实际阵亡 → 立即停止后续动作（`skipped`）。
- **单一结算**：`applyIntent` 同时用于预测（深拷贝上）与真实执行，保证「预览 = 实际」。
- **友伤**：落点有棋子不分阵营照常命中；攻击者位移（横推改线）语义由 Core 测试直接验证
  ——M0 真实对局中没有推力机制，二者结构上不可达，见 §4 的诚实修正。

## 2. 代码结构

| 文件 | 职责 |
| --- | --- |
| `Core/BattleState.ts` | 新增 `FrozenIntent`（actorId/defId/type/fromPos/toPos/offset/order）与 `state.intents?` 运行时字段（不入关卡 JSON，formatVersion 不变） |
| `Core/EnemyTelegraph.ts` | 纯规则：`planEnemyPrep`（深拷贝推演，返回准备移动）、`generateEnemyIntents`（冻结，帅>车>其他，同优先级按 y/x）、`applyIntent`（结算+变更）、`simulateIntents`（预测，帅亡截断）、`validateAttackShape`（形状/炮架/马腿重验）、`isHumanKingDead` |
| `Core/Rules.ts` | `resetTurn` 改为重置**双方**（回合恒在我方） |
| `GameManager.ts` | 状态机 `generating → enemyPrep → playerTurn → enemyAttack → …`；`endCurrentTurn` 进敌方攻击序列；`executeMove/executeAttack` 后 `refreshThreats()`；帅亡即时败北并入 `checkBattleEnd`；敌方棋子详情附威胁预测行 |
| `Map/ThreatOverlay.ts` | 哑视图：整格菱形 + 顺序号（命中=实心紫 / 落空=淡紫 / 待机=灰 / 失效不上格）；`setFocus` 突出单个敌人的意图路径 |
| `UI/UnitInfoPanel.ts` | `show(info, extraLines?)` 追加威胁预测行 |

- 删除：`Core/EnemyAI.ts`、`Core/Rng.ts`（贪心 AI 与随机工具被合同取代，Rng 仅被前者使用）。
- ThreatRoot 节点由 GameManager 按名称自发现（ResultPanel 同款约定），运行时 `setSiblingIndex(1)`
  保证树序渲染：地块 → 威胁 → 我方高亮 → 棋子。

## 3. 验证

- **Core 规则测试**：`tests/core/`（`tsc -p tsconfig.json` + `node dist/tests/core/run.js`），
  49 断言全绿：准备顺序/原地/不叠子/纯函数、offset 平移、走开落空、友伤、攻击者亡、
  炮架 0/1/2 与射空、马腿、越界、连锁一致性、帅亡截断。
- **夹具回归**：`node dist/tests/core/fixtures-check.js`，17 断言全绿（三个演练关的演示点逐项成立）。
- **类型检查**：`node tsc -p tsconfig.typecheck.json`（`cc` 简写垫片）全绿；
  顺带修复存量问题：`MapBuilder` 缺 `BattleMap` type import。
- **场景**：Main.scene 的 GameRoot 下新建 ThreatRoot（挂 ThreatOverlay）并已存盘。

### 浏览器/预览试玩方法

1. **完全重启预览**（历史踩坑：必须重启才加载新编译产物）。
2. 选关进入「演练 · 敌方预告基础 / 炮架攻防 / 序贯连锁」：
   - 基础关：看敌兵准备走位与紫格预告；把被瞄准的兵走开 → 预告变淡（落空）；
     点敌方棋子 → 详情显示「第 N 序 + 预测结果」并突出其路径。
   - 炮架关：车被炮瞄准；杀炮架/挪兵入线/走开分别得到 失效/双炮架失效/射空。
   - 连锁关：炮架是我方低血兵，被前序攻击击杀后炮的预告已预测为「失效：缺少炮架」，
     结束回合后实际执行与预测一致。
3. 主线关（一/二关）已补布我方帅（(0,5) 路格）：敌方兵每轮单步逼近帅，威胁逐步形成；
   「帅亡即败」随之生效（帅 140 血、敌兵攻击 35，需 4 次命中）。

## 4. 范围与诚实修正

- **友伤 / 攻击者位移**：真实对局结构不可达（无推力、冻结后敌方不动），仅 Core 测试覆盖语义；
  未来引入推力/位移机制时直接复用（offset 语义已验证）。
- **AC07 将死搜索**：Cocos 从未有该实现，天然符合「不存在」口径。
- **AC09（原型流程条款）**：属原型 UI 交接范围，Cocos 不接管。
- **撤销 / 波次 / 商店 / 成长 / 技能**：M0 范围外。
- 帅亡即时败北在**有帅关卡**参与判定（`humanHasKing`）；现有关卡未布帅，不参与。
