# 战局数据格式设计（提案）

- **状态**：提案 / Draft，待 M0 Vertical Slice 验证。`docs/architecture/facts.md` 中 Save System 仍为 `TBD`，本文档**不构成**已确认架构事实或项目规则。
- **示例**：[battle-state.example.json](./battle-state.example.json)
- **Human Owner**：TBD（策划 / Game Director）

## 1. 目的与范围

定义一份 JSON 文档，同时承担两种用途，避免两套格式：

- **初始化档**（`meta.kind: "battleInit"`）：关卡初始战局，进入战斗时的起点。
- **保存档**（`meta.kind: "battleSave"`）：任意时刻的完整战局快照，用于读档恢复。

范围只覆盖「数据长什么样」。读档/存档的代码框架、存储位置（本地 / 云端）不在本文范围内，待 M0 验证后再定。

## 2. 设计原则（扩展性的来源）

1. **`formatVersion` 版本号**：顶层第一个字段。同版本号内只做加法（新字段必须可选）；破坏性修改必须升版本号，并逐级写迁移函数。
2. **未知字段保留**：读取时遇到不认识的字段，忽略但**不得删除**——这样旧代码读新档不丢数据，写回后新字段还在。
3. **定义与实例分离**：单位属性、地形属性（移动消耗、防御加成等）放独立静态配置表；战局文件只存 `defId` 引用 + 实例差异（当前位置、当前 hp、状态）。新单位 / 新地形 = 只加配置，不改本格式。
4. **字符串 id 引用**：所有跨对象引用（unit→player、unit→def、tile→def）用稳定字符串 id；数组顺序不承载语义，读取后不得依赖下标。
5. **地图分层**：地图是 `layers` 数组，每层独立。新增玩法层（部署区、迷雾、触发器）= 追加新 layer 对象，旧结构不动。
6. **`extra` 兜底袋**：每个主要对象带可选 `extra: {}`，未定型的小数据先放这里，验证后再升级为正式字段。

## 3. 顶层结构

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formatVersion` | number | 是 | 格式版本，当前 `1` |
| `meta` | object | 是 | 文档元信息 |
| `rules` | object | 是 | 规则与胜负条件 |
| `map` | object | 是 | 地图 |
| `players` | array | 是 | 参战方列表 |
| `units` | array | 是 | 棋子 / 单位实例列表 |
| `turn` | object | 是 | 回合与阶段状态 |
| `rng` | object | 建议 | 随机数状态（seed + 已调用次数），保证读档后随机序列可复现 |
| `result` | object / null | 是 | 战斗结果，未结束为 `null` |
| `history` | object | 否 | 指令历史（Undo / 回放用），可整体省略 |

## 4. 分区说明

### meta

| 字段 | 说明 |
| --- | --- |
| `kind` | `"battleInit"` 初始化档 / `"battleSave"` 保存档 |
| `battleId` | 关卡 / 战局唯一 id |
| `displayName` | 显示名 |
| `createdAt` / `savedAt` | ISO 8601 时间戳 |
| `extra` | 兜底袋（如截图路径、存档槽备注） |

### rules

- `rulesetId`：规则集在静态配置中的 id。
- `params`：本局参数，如 `maxRounds`、`winConditions` / `loseConditions`（数组，每项 `{ "type": "...", ...参数 }`，type 对应规则集里注册的条件实现）。

### map

- `gridType`：`"square"`（默认）；未来支持 `"hex"` 时 `pos` 语义换为轴向坐标，字段不变。
- `width` / `height`：格子数。
- `layers[]`：每层 `{ id, type, default, cells }`。`type: "tileGrid"` 层的 `cells` 是二维数组，元素为地形 defId（引用静态配置）；`default` 是稀疏部分的默认地形。

### players / units / turn

- `players[]`：`{ id, name, team, controller, extra }`。
  - `controller`：控制方标记，`"human"` / `"ai"`，缺省按 `"human"` 处理。
  - `team`：阵营编号，支持未来扩展多方势力。
- **单人游戏（已确认）**：全局只有一个 `controller: "human"` 的参战方；敌方参战方为 `controller: "ai"`，AI 势力数量不限。
- `units[]`：`{ id, defId, owner, pos: {x, y}, hp, extra }`；hp 只存当前值，满值由 def 推导。
  - 可选：`actedThisTurn`（本回合是否已行动）、`statuses[]`（`{ id, turns, power? }`，效果 defId + 剩余回合 + 强度）。
- **敌我同表**（已确认需求）：我方棋子与敌方棋子共用同一个 `units` 数组，不分子列表；用 `owner` 指向 `players` 中的参战方区分敌我（示例中 `p1` = 玩家、`p2` = AI 敌军）。
- `turn`：`round`（回合数）、`order[]`（行动顺序，player id）、`active`（当前行动方）、`phase`（开放字符串，如 `command` / `battle` / `result`，新增阶段不改结构）。

## 5. 保存档与初始化档的差异

同一 schema，保存档只是字段更满：

```json
{
  "meta": { "kind": "battleSave" },
  "units": [{
    "id": "u1", "defId": "spearman", "owner": "p1",
    "pos": { "x": 3, "y": 4 }, "hp": 67,
    "actedThisTurn": true,
    "statuses": [{ "id": "poisoned", "turns": 2, "power": 5 }]
  }],
  "turn": { "round": 4, "order": ["p1", "p2"], "active": "p2", "phase": "command" },
  "rng": { "seed": 20260206, "calls": 137 },
  "result": null,
  "history": { "commands": [] }
}
```

## 6. 读取与版本兼容契约

1. `formatVersion` 等于当前支持版本：宽容读取——未知字段忽略并保留，缺失可选字段用默认值。
2. `formatVersion` 高于当前版本：逐级执行 `migrate(N → N-1)` 迁移链；迁移前必须先备份原文件。
3. 校验最小必需字段：`formatVersion`、`meta.kind`、`map.width/height/layers`、`players`、`units`、`turn`；其余缺失即用默认值。
4. 所有 id 引用（defId、owner、active）读取后需要可解析；解析失败的条目按项目当时的容错策略处理（M0 可直接报错）。

## 7. 扩展示例（均不需要破坏性改动）

| 未来需求 | 扩展方式 |
| --- | --- |
| 新单位 / 新地形 | 只加静态配置 defId，本格式不变 |
| 装备、技能、升级 | 先放 `unit.extra`，验证后升级为正式可选字段 |
| 雾战、部署区、地图触发器 | `map.layers` 追加对应 layer |
| 2v2 / 多方势力 | `players` 加成员，`team` 已预留 |
| Undo / 回放 | `history.commands` 记录指令流（可选字段） |
| 六边形地图 | `map.gridType: "hex"`，`pos` 换轴向坐标语义 |
| 阵营资源 / 行动点 | `player.extra` 过渡 → 正式字段 |
| 联机 / 远程对战 | `controller` 扩展新枚举值（如 `"remote"`），结构不变 |

## 8. 开放问题（TBD，待验证）

1. 网格默认方格，是否需要六边形待玩法验证。
2. 静态配置表（单位 def、地形 def）的文件组织方式未定——本格式只约定引用关系。
3. `history.commands` 是否需要（取决于是否要做 Undo / 回放），M0 可整体省略。
