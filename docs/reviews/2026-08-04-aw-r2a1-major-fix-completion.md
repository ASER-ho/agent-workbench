# AW-R2A1 MAJOR 修复完成报告

- 日期：2026-08-04
- 分支：`fix/aw-r2a1-major`
- 基线：`main` 保持 `2a96fc4`；P1-1A 仅在 `checkpoint/p1-1a-baseline`（`9f48e57`）

## 提交列表（按顺序）

| commit | message | 说明 |
|---|---|---|
| `7af0726` | docs: add AW-R2A1 major fix design | spec |
| `c8cc8a4` | feat: import reviewed AW-R2A1 verification slice | 候选导入 |
| `f2b070b` | docs: amend AW-R2A1 plan per execution gate review | 计划修订 |
| `dcb1ea3` | docs: add AW-R2A1 major fix implementation plan | 实施计划 |
| `4718eee` | fix: F1 decode Windows git discovery output safely | F1 |
| `b9377f3` | fix: F2 expose diff digest coverage semantics | F2 |
| `cf8647e` | fix: F3-F4 invalidate stale verification results | F3+F4 |
| `91de73f` | test: F5 reject Session Terminal and Action IPC usage | F5 |
| `90ef387` | test: F6 cover staged and unstaged state on one file | F6 |
| `7ccbe2d` | docs: F7 record reproducible R1A0 integrity evidence | F7 |

## 修复项落实情况

### F1 — git 发现层安全解码（MAJOR）
- 新增 `decodeWhereOutputCandidates(buffer)`（纯解码：gbk 优先 + 严格 utf-8 回退，去重/滤空行，`fatal:true` 严格模式，无效字节作废）
- 新增 `resolveWhereGitExecutable()`（固定 `SystemRoot\System32\where.exe`，buffer 读取，逐条经 `trustedLocalExecutable` 校验）
- 生产 `discoverTrustedGitExecutable`、测试 `gitPath()`、E2E `findGit()` 三处共用同一解析
- 本机（git 位于 `F:\GW\GW下载\Git` 非 ASCII 路径）3 个 git 单元测试恢复通过
- 新增 3 个解码测试（固定 GBK 字节、严格 UTF-8、双解码器无效字节）

### F2 — diffDigest 覆盖语义机器可读（MAJOR）
- `verification-types.ts` 新增 `diffDigestCoverage: 'complete' | 'truncated-prefix'`
- `inspect()` 按 `truncated` 填充；`buildPlainLanguageReceipt` 截断文案明确"只代表被保留的前缀，不代表完整仓库 Diff"
- 测试覆盖 `truncated=false → complete`、`truncated=true → truncated-prefix`

### F3+F4 — 旧验收结果主动失效（MAJOR，合并）
- 主进程 `WORKSPACE_CHOOSE` 成功 / `WORKSPACE_CLEAR` 后推送只读 `workspace:changed` 事件（仅 display-safe 信息）
- preload 暴露可解除的 `workspaceSelection.onChanged(callback): () => void`
- `VerificationWorkbench`：订阅事件 + focus/visibility 兜底重取 + 显式 requestId 新鲜度门禁；工作区身份一律用 `displayId` 比较；状态刷新失败清除旧结果并停止
- 关键实施发现：contextBridge 暴露的 `window.api` 成员为只读，E2E 无法 stub inspect/getStatus 构造时序 → 按计划降级路径，将 freshness guard 与 `sameWorkspace` 抽为纯函数模块 `inspection-guard.ts`，新增 5 个单元测试覆盖（请求中修改丢弃、A/B 竞态、失败路径、displayId 身份）
- E2E 主测试新增"修改允许路径后旧结果立即消失"断言（真实 UI 交互，已验证通过）

### F5 — E2E 完整 IPC 调用拦截（MINOR）
- 因 contextBridge 只读，改为**主进程 ipcMain 记录器**：监听全部 session/terminal/action 通道，安装确认 → 清空启动期记录 → 执行 verification 流程 → 断言无新增到达
- 完整 `test:electron` 39/39 通过，记录器不影响其他 spec

### F6 — MM（同文件 staged+unstaged）断言（MINOR）
- characterization 测试：构造"先 add 再修改"的 MM 文件，断言 `states` 同时含 staged 与 unstaged；现有实现已正确支持，直接 PASS

### F7 — R1A0 完整性证据口径（MINOR，记录项）
- 独立文档 `docs/reviews/2026-08-04-r1a0-integrity-verification-note.md`：明确 `0D5AA11D…` 算法未公开不可作为可重复依据；采用快照 `SHA256SUMS.txt`（57/57 OK）；不对快照做任何修改

## 全量验证结果

| 命令 | 测试数 | 退出码 | 结果 |
|---|---|---|---|
| `npm run build` | — | 0 | PASS |
| `npm run test:verification` | 18 | 0 | 18 pass / 0 fail |
| `npm run test:ipc-sender` | 2 | 0 | 2 pass / 0 fail |
| `npm run test:static` | 22 | 0 | 22 pass / 0 fail |
| `npx playwright test -c playwright.electron.config.ts verification-slice.e2e.spec.ts` | 1 | 0 | 1 passed |
| `npm run test:electron` | 39 | 0 | 39 passed |

## 约束核对

- `main` == `2a96fc4` ✅（未移动、未合并、未 Push）
- 当前分支 == `fix/aw-r2a1-major` ✅
- P1-1A 仅在 `checkpoint/p1-1a-baseline` ✅
- Runtime/PTY/Provider/Agent Session/SecretStore/Windows 进程树未修改 ✅
- `functionalVerificationPerformed` 恒为 `false`，无 `VERIFIED` 输出 ✅
- 每个 commit 可独立构建或通过对应定向测试 ✅

## 已知残留

- E2E 无法直接 stub `window.api`（contextBridge 只读），F3/F4 的时序类场景由 `inspection-guard` 单元测试覆盖，已在 E2E 注释与 spec 中记录
- `test:verification` 实际测试数 18（F1 增 3、F2 增 2 断言于既有测试、F3/F4 增 5、F6 增 1），最终总数不固定

## 下一步

本报告记录后，等待用户决定是否合并 `fix/aw-r2a1-major` 回 `main`。未执行合并/Push/Tag/Release。
