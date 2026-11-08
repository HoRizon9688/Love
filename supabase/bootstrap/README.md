# 新数据库身份底座

`20261109000000_identity.sql` 是新空库迁移链的第一段，依赖 Supabase 提供的 `auth.users`、`auth.uid()` 和 API 角色。当前放在 `bootstrap/` 单独验证，`supabase/migrations/` 仍是旧版历史链。新链齐备后再统一切换 CLI 迁移目录。新旧链不能叠加执行。

这段迁移创建资料、空间、成员和邀请表，保留现有的创建、绑定、重发、解除和成员资料 RPC 签名。每个空间只有 1、2 两个成员槽位，同一个账号只能属于一个空间。邀请码使用 32 位随机 UUID 十六进制文本，只存摘要，有效期 7 天，重发吊销上一条。接受时先锁空间，再检查并锁邀请码，加入和消费在同一个事务。

任一成员解绑或随账号删除而离开后，该空间停止接受新成员，仍在空间的一方继续通过 RLS 访问原空间。两人重新绑定需使用新空间。伴侣资料只经 RPC 返回昵称和头像，登录安全字段维持本人可读。原始成员表不加入实时 publication，避免 DELETE 事件暴露旧主键。后续用受授权的最小事件通知客户端重新查询，并在 Supabase 服务中验证 WebSocket 的隔离与解绑。应用全局账号准入、注册、恢复码、业务表 RLS 和 R2 属于后续迁移或服务改造。 [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#receiving-old-records)

## 本地验证

Windows x64 使用 Node 24 与独立的 PostgreSQL 17 工具目录。本次验证脚本、工具、临时数据库和动态测试身份均在 Git 提交范围之外。当前工作区可复跑本地留存的脚本，它只连接脚本自己启动的回环地址。

```powershell
node .local/phase2/verify-local-identity.mjs
```

脚本在两套全新 PostgreSQL 数据库运行同一组断言。每组生成匿名上下文、两个或更多隔离的账号会话，通过独立连接并发执行 RPC，验证数据库实际 RLS、DDL 和事务。账号数据为临时数据库生成的合成记录，测试结束后清理。Auth 的数据库上下文由测试设置，真实 Supabase 登录、PostgREST 和 WebSocket 需要独立 Supabase 测试栈。
