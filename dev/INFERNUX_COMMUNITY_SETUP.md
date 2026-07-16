# Infernux 社区页启用清单

本清单对应 `docs/community.html`。论坛数据不落在 GitHub Pages：Discussions 保存交流，Issues 保存可执行问题，Giscus 只负责把 GitHub 登录与一条 Discussion 嵌入网站。

## 已核对的仓库状态

- 仓库：`ChenlizheMe/Infernux`
- Repository ID：`R_kgDOO_wV3A`
- GitHub Discussions：已启用
- GitHub Issues：已启用
- General Category ID：`DIC_kwDOO_wV3M4C5oaC`
- 可用分类：Announcements、General、Ideas、Polls、Q&A、Show and tell

以上仓库状态于 2026-07-15 通过 GitHub API 读取。若仓库迁移、分类删除后重建或改名，应重新生成 Giscus 配置。

2026-07-16 已完成 Giscus GitHub App 安装，并通过公开 category API 复核：仓库、Repository ID、General 分类名称与 Category ID 均和 `community.html` 一致。健康检查已移除 `--allow-uninstalled` 临时豁免；今后卸载 App、关闭 Discussions / Issues 或重建分类都会成为硬失败。

## 安装结果与剩余验收

1. Giscus GitHub App 已安装并授权 `ChenlizheMe/Infernux`。
2. 当前 `community.html` 配置为：
   - `data-repo="ChenlizheMe/Infernux"`
   - `data-repo-id="R_kgDOO_wV3A"`
   - `data-category="General"`
   - `data-category-id="DIC_kwDOO_wV3M4C5oaC"`
   - `data-mapping="specific"`
   - `data-term="Infernux Community Wall"`
3. 部署后打开 `https://infernux-engine.com/community.html`，先点击“加载回复”，再使用非管理员 GitHub 账号测试登录、回复和 reaction；刷新当前标签页后还应自动恢复已选择的嵌入，打开一个全新标签页则应保持按需待命状态。
4. 在 GitHub Discussions 中确认生成的 `Infernux Community Wall` 话题位于 General 分类，并测试锁定、隐藏与删除等管理操作。

## 安全边界

- 不在 HTML、JavaScript、仓库文件或构建产物中保存 GitHub token；若未来的自动化确需令牌，只能使用最小权限的 GitHub Actions secret。
- 当前公开话题列表只调用 GitHub 公共 REST API，不携带 token；达到匿名频率限制时自动降级为 GitHub Discussions 链接。
- Giscus 客户端不会随社区页自动加载；只有访客明确点击“加载回复”后才连接 `giscus.app`，该选择只在当前标签页的 `sessionStorage` 中保留。
- 登录与发言由 Giscus/GitHub OAuth 完成，网站不接收 GitHub 密码或 OAuth access token。
- 不要在静态页面实现 OAuth callback 并写入 client secret。若未来需要自定义账号态、发帖或聚合接口，应增加独立的 GitHub App 与 Worker/BFF。

## 管理员声明

- 当前站点唯一声明的社区管理员账号为 `ChenlizheMe`；该明文账号只用于公开身份说明与配置审计。
- 真正的 Discussion / Issue / Giscus 管理能力仍由 GitHub 仓库角色判定。前端的管理员名单不会授予权限，也不能取代 GitHub 的访问控制。
- 若未来新增管理员，必须同时复核 GitHub 仓库权限、修改 `community.html` 的 `data-community-administrators`，并更新本清单；不得只改前端名单。

面向访客的数据说明已直接呈现在 `community.html`，不再只存在于本清单。公开说明覆盖以下事实：

- 本站在 `localStorage` 保存语言、主题和可选学习路径进度，在 `sessionStorage` 保存五分钟公开话题缓存以及当前标签页的 Giscus 加载选择；不设置第一方账号 Cookie，也不建立用户档案；
- 社区页会自动访问 GitHub 公共 API；只有访客选择“加载回复”后才访问 `giscus.app`，字体和图标由 Infernux 自身域名提供；
- Discussion、Issue、回复、作者和时间存储于 GitHub，且按 GitHub 仓库权限公开；
- Giscus 可能在 `giscus.app` 域的 `localStorage` 保存经服务端加密的登录令牌，Infernux 页面无法读取该跨域存储；
- 页面提供 GitHub 隐私声明、GitHub 已授权应用管理页与 Giscus 隐私政策的直链，用户可检查或撤销授权。

官方边界参考：

- GitHub 隐私声明：<https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>
- GitHub 授权应用管理：<https://github.com/settings/applications>
- Giscus 隐私政策：<https://github.com/giscus/giscus/blob/main/PRIVACY-POLICY.md>

## 内容分流规则

| 内容 | 存储位置 |
|---|---|
| 普通交流、使用经验 | Discussions / General |
| 有明确答案的问题 | Discussions / Q&A |
| 未进入实施阶段的提案 | Discussions / Ideas |
| 项目、场景、工具展示 | Discussions / Show and tell |
| 可复现缺陷 | Issues |
| 已接受、可追踪的工程工作 | Issues |

社区页只是呈现层；GitHub 权限、分类、锁定、隐藏和封禁始终是权威管理面。

## v1 架构决定（2026-07-15）

当前需求可由三层静态能力覆盖：公共 REST API 读取最新 Discussion、GitHub 原生页面创建分类话题/Issue、Giscus 完成 GitHub 登录和站内墙回复。因此 v1 **不部署自建 BFF，也不创建自有用户或帖子数据库**。

只有出现以下任一明确需求时，才重新评估 GitHub App + Worker/BFF：

- 在网站内浏览任意 Discussion / Issue 的完整正文与分页回复；
- 在网站表单内创建不同分类的 Discussion 或带受控标签的 Issue；
- 在任意帖子详情页直接回复，而不只是使用一条 Giscus 社区墙；
- 需要登录态聚合、写入后缓存失效、站内频率限制或 webhook 同步。

这条边界既减少运维面，也避免为静态 Pages 引入无法安全保存的 OAuth client secret。未来若启动 BFF，GitHub 仍是帖子真源，Worker 只承担 OAuth、受控 API 代理、短期会话与公开读缓存。
