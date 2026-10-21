# US-020 R3 浏览器验收逐项结果

- 范围：US-020 R3 主营地/旅程成长/关卡预览 + 保存撤回边界：正常入口 + 专项 + 规则
- 完成时间：2026-10-21T06:15:52.748Z
- 结果行：54；通过 54；失败 0；pageerror 0
- 截图次数：71（55 个唯一文件）

| 用例ID及子分支 | 类型 | 结果 | 实际执行与核对 | 证据 |
| --- | --- | --- | --- | --- |
| C01 | 正常浏览器 | 通过 | 首次跳过禁用且提示「首次游玩必须完成教学，完成前不能跳过进入主营地。」；7 步教学目标实际完成后先入主营地（view=camp），未直接进入正式战斗。 | c01-tutorial-entry.png,c01-tutorial-steps.png,c01-tutorial-done.png |
| C03-完成路径 | 正常浏览器 | 通过 | 教学实得猫粮 G=1；入营后猫粮 9=G+8（8 为首次入营奖励），坚守自动生效、队伍满血、人口 4、公共 SP 0。 | c01-tutorial-done.png |
| C07-满级 | 专项 | 通过 | 专项余额 20：连续四次扩编得到人口 5/6/7/8 与余额 15/10/5/0，满级后按钮禁用，无赠送人口。 | c07-population.png |
| C07-余额边界 | 专项 | 通过 | 专项余额 4 扩编禁用；余额 5 恰好成功并把余额扣到 0。 | c07-balance.png |
| C09 | 正常浏览器+专项 | 通过 | 招募价目与实施前商店一致（兵3/车5/马5/炮8/仕5）；正常点击招募兵扣 3 猫粮并进入队伍；无出售/遣散入口；顶部与提示统一显示猫粮。 | c09-recruit.png |
| C26 | 正常浏览器 | 通过 | 首次入营自动显示指引（扩编/招募/SP/增益顺序与费用），跳过可关闭且玩家级标志置 true；「帮助」可重看且不扣资源（余额 6 不变）。 | c26-guide.png,c26-guide-skip.png |
| C11 | 专项 | 通过 | 专项余额 10：疾行 10→5、救援 5→0；救援在移动未解锁时禁用并提示「先解锁移动增益」；解锁后三增益同时生效且不可重购。 | c11-buffs.png |
| C12 | 专项 | 通过 | 入关后普通队友继承 +1 HP 与 +1 移动（车 4→5 格、弓攻距不变）；主帅不继承；刷新后仍在本关布阵且加成只一次。 训练营名单：上阵 · 车 · rook · Lv.1 · 击杀 0 上阵 · 兵 · starting-pawn · Lv.1 · … | c11-buffs.png,c12-buff-reload-battle.png |
| C13 | 专项 | 通过 | 同一扩编按钮连续触发两次只扣一次（人口 4→5、余额 20→15）；随后合法扩编与招募仍可连续执行（人口 6、余额 7）。 | c13-repeat-purchase.png |
| C10 | 专项 | 通过 | 专项余额 2：炮按钮禁用且只显示价格、不出现差额；疾行因未获坚守禁用；强行触发点击不扣款。 | c10-disabled.png |
| C02-失败重试 | 专项 | 通过 | 专项：教学主帅阵亡后显示失败提示且仍停留在教学（view=battle，未入营），重试回到第 1 步。 | c02-tutorial-fail.png |
| C02-老玩家跳过 | 专项 | 通过 | 专项：曾完成教学的玩家新旅程可跳过（二次确认，取消不改变状态），入营猫粮 8（无教学收益），view=camp。 | c02-skip.png |
| C03-跳过路径 | 专项 | 通过 | 跳过路径：猫粮 8（无教学收益）、人口 4、SP 0、车兵弓枪无炮仕、坚守自动生效且满血。与完成路径的差别仅教学猫粮 G=1。 | c02-skip.png |
| C04 | 正常浏览器 | 通过 | 刷新后猫粮 6 不回退不重发（首次奖励标志保持）；开始新旅程后只重发一次 8 猫粮，教学完成资格与指引已看标志保留，指引不再自动弹出。 | c04-camp-reload.png,c04-idempotent.json |
| C25 | 正常浏览器 | 通过 | 新旅程后进度/资源/人口重置（completed 0、猫粮 8、人口 4、SP 0），首次营地 8 猫粮与坚守恢复，教学跳过资格与指引标志保留。 | c25-new-journey.png,c04-idempotent.json |
| C05 | 正常浏览器 | 通过 | 入关前可在地图↔主营地往返且猫粮/增益不退（余额 8）；确认进入关卡后只有布阵界面；布阵中刷新/继续仍恢复本关布阵，快照不变，菜单不能回营或重选关。 | c05-deploy.png |
| C08 | 专项 | 通过 | 专项人口 5：连续招募不受阻断（后备不限），上阵普通队友始终 ≤5；仕固定上阵不占人口（场上额外 1 座）；换下 1 人后场上 4 名普通队友仍可确认布阵。0 名与超人口的拒绝由规则用例覆盖。 | c08-roster.png |
| C14 | 专项 | 通过 | 专项已解锁救援：第 5→6 回合进入救援，仅列合法目标；救援 rook 回复到 3/3（含坚守上限），随后进入第二波且本关不再触发。 | c14-rescue.png |
| C16 | 专项 | 通过 | 救援名单 rook,starting-archer,starting-pawn,starting-spearman 与规则合法目标 rook,starting-pawn,starting-archer,starting-spearman 完全一致；主帅、仕/仕残骸、满血单位与已销毁尸体不在名单。规则用例另有 0 目标自动进入第二波的断言。 | c14-rescue.png |
| C15 | 专项 | 通过 | 专项：阵亡普通队友在尸体位置以 1 HP 复活并移除尸体，未出现叠子；已销毁尸体不在救援名单。 | c15-revive.png |
| C17-待选择刷新 | 专项 | 通过 | 救援待选择时刷新：恢复 view=battle/phase=rescue，rescueUsed 仍为 false，救援弹层与合法名单恢复，不能回营。 | c17-rescue-before-skip.png,c17-rescue-pending-reload.png |
| C17-跳过刷新 | 专项 | 通过 | 救援跳过：wave=2，rescueUsed=false→true；刷新后 view=battle、wave=2、rescueUsed=true，救援弹层不重发，不能回营/重选关。 | c17-rescue-before-skip.png,c17-rescue-skip-reload.png,c17-rescue-log.json |
| C17-失败重试 | 专项 | 通过 | 重试恢复入关快照：布阵、wave=1、rescueUsed=false；重新推进到第 6 回合再次出现救援，跳过后本关只消耗一次。 | c17-rescue-retry.png,c17-rescue-log.json |
| C17-使用刷新 | 专项 | 通过 | 救援使用 rook：回满 HP、wave=2、rescueUsed=true；刷新后 view=battle 且仍为 true/wave2，弹层不重发。 | c17-rescue-use-reload.png,c17-rescue-log.json |
| C21 | 正常浏览器 | 通过 | 正常通关第 1 关后查看三关：各 81 格地形与第一波站位；已通关第 1 关和未解锁第 3 关不可进入，只有当前第 2 关可进入；只查看预览不产生资源/快照/战局。 | c21-map-normal.png |
| C06 | 正常浏览器 | 通过 | 正常通关三关：第1关 wave2/turn11/猫粮12；第2关 wave2/turn11/猫粮15；第3关 wave2/turn11/猫粮18；非最终关结算后进入主营地并满血恢复，最终关直接显示通关结算且刷新后仍停留在终局。 | c06-camp-after-level1.png,c06-camp-after-level2.png,c06-final.png,c06-final-reload.png,c06-final-resume.json |
| C18 | 专项 | 通过 | 专项构造临胜利伤员、普通阵亡、被毁仕与成长，经真实结算回调入营：全部恢复满血，身份/等级/仕间隔保留，猫粮不重复发放。 | c18-special-recovery.png,c18-recovery.json |
| C11-正常 | 正常浏览器 | 通过 | 正常入口链路（教学→第1关胜利）自然余额 12，依次解锁疾行 12→7、救援 7→2；三增益同时生效，未注入余额。 | c11-normal.png,c11-normal.json |
| C24-首次奖励 | 正常浏览器 | 通过 | 教学完成入营后余额 9（含首次入营 8 与教学实得）；关闭页面再继续后仍为 9，首次奖励标志保持 true，不重复发放。 | c24-first-reward-close.json |
| C24-招募 | 正常浏览器 | 通过 | 正常招募兵：猫粮 9→6，关闭页面再继续后余额 6 且该兵仍在队伍，扣款与结果一致。 | c24-recruit-close.json |
| C19-营地正常 | 正常浏览器 | 通过 | 正常两关后公共 SP 6，营地为后备 recruit-pawn-0 与上场 rook 各升级一次并立即刷新，SP 与成长保持；后备成长在入关队伍中仍在。 | c19-normal-camp.png,c19-camp-normal.json |
| C24-营地SP | 正常浏览器 | 通过 | 同一正常旅程营地为后备与上场各升级一次；每次完成后刷新，SP 6→5→4，后备/上场成长与公共 SP 池同时恢复一致。 | c19-normal-camp.png,c19-camp-normal.json |
| C24-增益解锁 | 正常浏览器 | 通过 | 疾行 12→7、救援 7→2；每项完成立即刷新，余额和三增益状态均保持。 | c24-normal-buffs.png,c24-buffs-reload.json |
| C19-布阵战斗正常 | 正常浏览器 | 通过 | 同一自然旅程第 3 关：布阵花 SP 4→3，战斗再花 1 SP→2；后备 recruit-pawn-0 成长保留，rook 强健累计 3 次；两次升级后刷新均保持且不退款。 | c19-normal-battle.png,c19-three-stage.json,c19-u1-deploy-reload.png,c19-u1-battle-upgrade-reload.png |
| C19-U1 | 正常浏览器 | 通过 | 同一自然 SP 旅程：营地后备/上场升级后刷新 SP 6→5→4 与成长保持；第 3 关布阵升级 4→3 刷新后仍在布阵且不退款；战斗升级 3→2 刷新后 SP 与成长保持、不重复，升级后不能撤回；移动后升级的另一条正常路径见 C19-U1-先移动再升级。 | c19-u1-deploy-reload.png,c19-u1-battle-upgrade-reload.png,c19-u1-camp-deploy-battle.json,c19-camp-normal.json |
| C24-U1 | 正常浏览器 | 通过 | 同一自然 SP 数据核对：营地升级每次刷新后公共 SP 与后备/上场成长同步保持（5/4）；布阵/战斗升级刷新后 SP 3/2 与成长一致，不退款、不重复升级。 | c19-u1-camp-deploy-battle.json,c19-camp-normal.json |
| C23-正常 | 正常浏览器 | 通过 | 正常旅程第 3 关：入关快照 SP 4/猫粮 2；布阵与战斗各花 1 SP，真实失败后刷新仍为失败，重试回到布阵并恢复 SP 4、猫粮 2 与强健前 HP，且不能回营/重选关。 | c23-normal-failure.png,c23-normal-retry.png,c23-normal.json |
| C19-U1-非法升级 | 专项 | 通过 | 专项：布阵已确认且公共 SP 0；打开/收起升级面板不写续局；对主帅执行非法升级（无资格）被规则拒绝，SP、revision 与续局原文均不变；刷新仍回到确认布阵保存点。未注入 SP。 | c19-u1-invalid-upgrade.png,c19-u1-invalid-upgrade.json |
| C23-攻击刷新 | 专项 | 通过 | 专项在真实战场放置邻格敌兵，经 UI 攻击击杀后立即刷新：续局 revision 1、击杀账本与移除结果保留，未回滚入关快照，view=battle 且不能回营/重选关。 | c23-attack-reload.png,c23-attack-reload.json |
| C23-M1 | 正常浏览器 | 通过 | 正常入口（教学→第1关）确认布阵保存点 revision 0；普通移动车到 (2,1) 与撤回均不改变存档原文，撤回恢复原位；再次移动后刷新恢复保存点的车位 (1,1) 与 revision 0，view=battle 且不能回营/重选关。 | c23-m1-move.png,c23-m1-move-undo.json |
| C23-M2 | 正常浏览器 | 通过 | 正常入口先移动车再攻击击杀 w1-0：攻击保存 revision 2、击杀账本与车移动后位置一并写入，攻击后不能再撤销；刷新恢复攻击局面；随后仅移动主帅到 (4,1) 不覆盖攻击保存点，再次刷新主帅回到 (5,1)、车仍在 (2,1)，view=battle 且不能回营。 | c23-m2-attack-reload.png,c23-m2-move-attack.json |
| C19-U1-先移动再升级 | 正常浏览器 | 通过 | 与 C23-M2 同一正常入口：真实击杀得 1 自然 SP；先移动主帅到 (4,1) 再升级 rook 强健，升级保存当时一致局面（SP 1→0、rook 强健 1、主帅在 (4,1)，升级后不可撤回）；刷新后不退款、不重复升级，移动一并恢复。 | c19-u1-move-upgrade-reload.png,c19-u1-move-upgrade.json |
| C23-M2-敌方攻击 | 专项 | 通过 | 专项（预置旅程，非正常资源）：确认布阵后先普通移动车到 (2,1)，移动不写续局；结束回合触发真实敌方攻击并保存 reason=回合推进、turn 2，刷新恢复敌方攻击后完整局面与移动位置，不能回营。 | c23-m2-enemy-attack.png,c23-m2-enemy-attack.json |
| C23-M2-牵引 | 专项 | 通过 | 专项（预置牵引车与 (3,1) 敌兵）：真实 UI 牵引攻击把目标拉到 (2,1)，续局 reason=攻击结算、revision 1；刷新恢复目标与车的位置，未回滚入关快照，不能回营。 | c23-m2-pull.png,c23-m2-pull.json |
| C19-专项夹具 | 专项 | 通过 | 专项夹具：营地技能列表覆盖上场与后备队友；点击升级共用公共 SP 池（6→5）；后备成长随入关保留（规则用例 C19/C12 覆盖）。 | c19-skills.png |
| C20 | 专项（营地UI） | 通过 | 主帅无任何个人升级按钮；仕只有攻击间隔 3/5 SP 且无治疗/强健（规则用例 C20 断言）。 | c19-skills.png |
| C21-夹具补充 | 专项 | 通过 | 专项夹具（已完成第 1 关）复核：三关全部可预览（各 81 格地形与第一波敌方站位：第一波敌方 8 枚：兵（2,6）、兵（5,6）、兵（8,6）、车（9,8）、炮（…）；已通关第 1 关与未解锁第 3 关不可进入，只有当前下一关可进入；仅查看预览无资源/快照/战局副作用。 | c21-map-preview.png |
| C22 | 专项 | 通过 | 专项绑定编辑器图到第 2 关（0,1 树林、8,1 山、敌兵移 (1,3)）：地图预览的地形与第一波站位与实际入关完全一致；预览不含第二波位置，第二波仍按战斗内预告显示。 | c22-preview-bound.png |
| C23-专项夹具 | 专项 | 通过 | 专项夹具：确认进入关卡即记录快照（SP 4）；布阵期花 2 SP 转职；真实失败后重试回到布阵，SP 与猫粮恢复入关值、转职回滚，且不能返回主营地。 | c23-failure.png |
| C24-存储失败专项 | 专项 | 通过 | 专项：正常扩编立即写入人口 5 并在刷新后保持；把 setItem 替换为抛错后再次扩编，界面回退且余额/人口不变，存储内容未改写——不虚报成功也不复制收益。 | c24-storage-fail.json |
| C27-救援选择 | 专项 | 通过 | 1280×720 网页版与 844×390 手机版均用实际显示模式按钮切换；两模式下救援名单按钮、跳过按钮均在视口内、可点击且命中按钮，选择目标后 wave=2/rescueUsed=true。 | c27-desktop-select.png,c27-mobile-select.png,c27-dual-rescue.json |
| C27-救援跳过 | 专项 | 通过 | 1280×720 与 844×390 两模式跳过按钮均在视口内、可点击；跳过救援后 wave=2/rescueUsed=true，状态不因显示模式切换而变化。 | c27-desktop-skip.png,c27-mobile-skip.png,c27-dual-rescue.json |
| C27-页面可达 | 专项 | 通过 | 两模式专项上下文均检查主营地、地图 81 格预览、布阵确认与战斗入口可见可点；实际 layoutMode 与按钮选择一致，模式切换前后旅程状态一致，见 c27-dual-rescue.json。 | c27-desktop-select.png,c27-mobile-select.png,c27-dual-rescue.json |
| C28 | 规则+静态检查 | 通过 | 代码/文档/测试/证据一致性：C01～C28 共 28 个唯一 ID，本轮含本行共 54 行结果；无空证据、无失败、无旧三选一/关间商店/刷新回营语义；普通移动/撤回不写续局、攻击/升级/阶段推进保存的静态检查通过；正常分支 13 个均存在，最终哈希写入 c28-audit.json。 | c28-audit.json,us020-result.json |

## 文件哈希（与本次运行证据对应）

| 文件 | SHA-256 |
| --- | --- |
| `web/index.html` | `8a87862f09e576d3920c131e519a00373cc86816bb177bd4adda70a4082a1555` |
| `web/js/rules.js` | `230b17befef2249fcfb3e566b004a02a71c63eb1aad05025d2a8d20e1196ddf1` |
| `web/js/app.js` | `c7342cd3b1b73c858b743aaf34c7a06b520d62e89d2f0d67b7c32e6c6bfd97f9` |
| `web/js/campaign.js` | `8fce32ce09c2348974f582b732d4b828addaf6386bb1e44f448541aa5b7fcfa4` |
| `web/js/journey.js` | `3f5fa260fef670f0a64e00d665bff7b62323acc4f5f4e2338eba69f3aa9925b4` |
| `web/js/tutorial.js` | `d396f135aaa3d3a798a14bfb57cd3888d74de688f378da49d71ac4fe95fb6828` |
| `web/js/ui.js` | `a7b33468f5c747e32a1df10bad2d682cb34e4a8f8716ecc988922da5be19fa15` |
| `web/js/maps.js` | `878d29b09826a7e661c7d643ae784c916b920e9d6dc1c1e830d13195e69cd4bf` |
| `web/camp.css` | `fc7a0234e59850032619e4ee23412eb94e2999d6c87f6c34f3127eae4c643f1a` |
| `web/campaign.css` | `936d4c24a440cacc7865f87c46c0fed776d902957db023ab612d06a045259429` |
| `tests/us020-camp.test.cjs` | `e6de5df82b20129c54386b130220fcc95f3bb4cae35d2ca488eb5c33f20f7bd4` |
| `tests/us020-acceptance-browser.cjs` | `a75aee8b19fa5271a1fb853579391afefc1c11d282c54ee26bf86a582262f168` |

- pageErrors：0（无页面错误）
