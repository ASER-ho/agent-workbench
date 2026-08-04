# R1A0 完整性验证证据口径

- 日期：2026-08-04
- 范围：AW-R1A0-SNAPSHOT-20260731-170533-2a96fc4d

## 结论

R1A0 快照完整性以快照自带 `SHA256SUMS.txt` 为准，验证结果为 **57/57 OK**。

## 证据口径修正

- 审查报告中出现的 `0D5AA11D…` 树指纹，其算法未公开，**不能作为可重复验证依据**。
- 当前采用快照内 `SHA256SUMS.txt` 作为唯一完整性口径。
- 验证命令：`sha256sum -c SHA256SUMS.txt` → 57 项全部 `: OK`，0 FAIL。
- 不对快照内容做任何修改。

## 验证输出（2026-08-04）

```
OK: 57
FAIL: 0
```

抽查末尾条目（全部 OK）：

```
tracked-worktree/manifest-display-safe.txt: OK
tracked-worktree/manifest.nul: OK
untracked/files.zip: OK
untracked/manifest-display-safe.txt: OK
untracked/manifest.nul: OK
```

## 说明

本记录不修改快照内容，仅作为可复现的完整性证据口径。
