# Tasks

## Phase 1: 后端基础设施

- [x] Task 1: 提示词优化后端 API 与配置
  - [x] SubTask 1.1: 在 `UserSettings`（`desktop/src/types/settings.ts` 及 `src/server/services/settingsService.ts`）中新增 `promptOptimization` 配置字段，包含：`enabled`、`optimizePrompt`（自定义优化指令文本）、`model`（使用的模型，默认 haiku）、`temperature`（默认 0.3）
  - [x] SubTask 1.2: 在 `src/server/api/settings.ts` 中扩展 GET/PUT `/api/settings/user` 以支持读写 `promptOptimization` 字段
  - [x] SubTask 1.3: 新增后端 API 端点 `POST /api/prompt-optimize`（在 `src/server/api/` 下新建 `promptOptimize.ts`），接收 `{ text, sessionId, context }`，调用 AI 进行优化；该调用经现有 proxy 链路以确保 Trace 记录和 token 统计
  - [x] SubTask 1.4: 在 `src/server/router.ts` 中注册 `/api/prompt-optimize` 路由

- [x] Task 2: 技能在线安装后端 API
  - [x] SubTask 2.1: 新增 `src/server/api/skillInstall.ts`，提供 `POST /api/skills/install` 端点，接收 `{ source }`（URL 或本地路径）
  - [x] SubTask 2.2: 实现安装流程：下载/读取源 → 解压（若为 zip）→ 解析 `SKILL.md` frontmatter（复用 `parseSkillFrontmatterFields`）→ schema 验证 → 权限审查（allowed-tools）→ 写入 `~/.claude/skills/<name>/`
  - [x] SubTask 2.3: 在 `src/server/router.ts` 中注册 `/api/skills/install` 路由

- [x] Task 3: 命令管理后端（置顶与分类）
  - [x] SubTask 3.1: 在 `UserSettings` 中新增 `commandManagement` 字段：`pinnedCommands: string[]`（置顶命令名列表）、`commandCategories`（可选的自定义分类映射）
  - [x] SubTask 3.2: 扩展 settings API 以支持读写 `commandManagement` 字段

- [x] Task 4: 服务商预设清理与默认服务商编辑/删除支持
  - [x] SubTask 4.1: 审计 `src/server/config/providerPresets.json`，移除冗余/过期预设（保留经验证的必要项）
  - [x] SubTask 4.2: 检查 `src/server/api/providers.ts` 和 `providerService.ts`，确保删除/编辑 API 对所有服务商（含官方/默认）均无限制；移除任何阻止默认服务商编辑/删除的 guard

## Phase 2: 前端功能实现

- [x] Task 5: 提示词优化前端（输入框按钮 + 配置 UI）
  - [x] SubTask 5.1: 在 `desktop/src/api/settings.ts` 中新增 promptOptimization 的读写方法
  - [x] SubTask 5.2: 在 `desktop/src/api/` 新增 `promptOptimize.ts` 客户端 API（调用 `POST /api/prompt-optimize`）
  - [x] SubTask 5.3: 在 `desktop/src/components/chat/ChatInput.tsx` 工具栏中新增"优化提示词"按钮（Wand/Aparkles 图标），点击后调用优化 API，优化期间显示 loading 状态，完成后替换输入框文本
  - [x] SubTask 5.4: 在 `desktop/src/pages/Settings.tsx` 的 `GeneralSettings` 中新增"AI 提示词优化"配置区块（开关、优化指令文本框、模型选择、temperature 滑块）
  - [x] SubTask 5.5: 在 `desktop/src/stores/settingsStore.ts` 中新增 promptOptimization 相关 state 和 setter
  - [x] SubTask 5.6: 添加 i18n 翻译条目（en/zh/zh-TW/jp/kr）

- [x] Task 6: 技能在线安装前端
  - [x] SubTask 6.1: 在 `desktop/src/api/skills.ts` 中新增 `install(source)` 方法
  - [x] SubTask 6.2: 在 `desktop/src/types/skill.ts` 中新增安装相关类型（`SkillInstallResult`、`SkillInstallProgress`）
  - [x] SubTask 6.3: 在 `desktop/src/components/skills/SkillList.tsx`（或新建 `SkillInstallDialog.tsx`）中新增"在线安装技能"按钮和安装对话框（输入源地址 → 显示进度 → 成功/失败提示）
  - [x] SubTask 6.4: 安装成功后自动刷新技能列表（调用 `skillStore.fetchSkills`）
  - [x] SubTask 6.5: 添加 i18n 翻译条目

- [x] Task 7: 命令管理前端（设置 Tab + 输入框集成）
  - [x] SubTask 7.1: 在 `desktop/src/stores/uiStore.ts` 的 `SettingsTab` 类型中新增 `'commands'` tab
  - [x] SubTask 7.2: 在 `desktop/src/pages/Settings.tsx` 中新增 `CommandManagementSettings` 组件：列出所有命令（按分类分组）、支持置顶切换、显示命令来源和描述
  - [x] SubTask 7.3: 修改 `desktop/src/components/chat/composerUtils.ts` 中的 `filterSlashCommands`，读取 `pinnedCommands` 设置，置顶命令优先排序
  - [x] SubTask 7.4: 在斜杠命令建议列表 UI（`ChatInput.tsx`）中为命令添加分类标签/分组显示
  - [x] SubTask 7.5: 在 `desktop/src/stores/settingsStore.ts` 中新增 `commandManagement` 相关 state/setter
  - [x] SubTask 7.6: 添加 i18n 翻译条目

- [x] Task 8: 服务商删除确认 + 编辑增强前端
  - [x] SubTask 8.1: 在 `SortableProviderCard`（`Settings.tsx`）的删除操作中增加确认对话框（Modal），显示服务商名称和影响说明
  - [x] SubTask 8.2: 确保所有服务商（含官方/默认）的编辑和删除按钮均可用（移除 UI 层面的 disabled 状态）
  - [x] SubTask 8.3: 添加 i18n 翻译条目

## Phase 3: 审计与可视化增强

- [x] Task 9: AI 默认提示配置端到端审计
  - [x] SubTask 9.1: 审计 `src/constants/prompts.ts` 中所有提示词构建函数（`getSystemPrompt` 及各 section builder），确认无逻辑矛盾
  - [x] SubTask 9.2: 审计 `src/utils/systemPrompt.ts` 中 `buildEffectiveSystemPrompt` 的优先级链（override → coordinator → agent → custom → default），验证"跳过模式"（overrideSystemPrompt）路径正确
  - [x] SubTask 9.3: 记录审计结论，修复发现的缺陷（若有）

- [x] Task 10: 思考过程可视化增强
  - [x] SubTask 10.1: 审计所有触发思考的代码路径（`QueryEngine.ts`、query 相关文件），确认均正确发出 `{ type: 'thinking'; text }` 流式事件
  - [x] SubTask 10.2: 确认 `ThinkingBlock.tsx` 在收到思考流式事件时实时展示内容（而非仅显示"思考中"占位）
  - [x] SubTask 10.3: 确认 `StreamingIndicator.tsx` 仅在思考尚未开始（无 activeThinkingId）时显示占位，一旦思考 delta 到达即切换为 ThinkingBlock

## Phase 4: 验证与部署

- [x] Task 11: 集成测试与验证
  - [x] SubTask 11.1: 验证提示词优化：按钮可点击 → 优化成功 → 文本替换 → Trace 记录 → token 统计
  - [x] SubTask 11.2: 验证技能安装：输入源 → 安装成功 → 列表刷新；无效源 → 失败提示
  - [x] SubTask 11.3: 验证命令管理：置顶设置 → 输入框优先显示；分类 → 准确区分
  - [x] SubTask 11.4: 验证服务商：删除确认弹窗 → 所有服务商可编辑/删除
  - [x] SubTask 11.5: 运行 lint 和 typecheck（`cd desktop && bun run lint && bun run test -- --run`）

- [x] Task 12: GitHub 同步与 Windows 构建
  - [x] SubTask 12.1: 将代码提交并推送到 `https://github.com/Hua-Qin/cc-haha`（使用提供的 token）
  - [x] SubTask 12.2: 执行 Windows x86（ia32）架构构建（调整/新建构建脚本，确保 `electron-builder` target 包含 ia32）
  - [x] SubTask 12.3: 验证构建产物可正常运行（GitHub Actions Run #27863998557 全部步骤成功）

# Task Dependencies

- Task 5 依赖 Task 1（后端 API）
- Task 6 依赖 Task 2（后端 API）
- Task 7 依赖 Task 3（后端配置字段）
- Task 8 依赖 Task 4（后端服务商改动）
- Task 11 依赖 Task 5-10 全部完成
- Task 12 依赖 Task 11 验证通过
- Task 1/2/3/4 可并行开发（后端独立模块）
- Task 9/10 可与 Phase 2 并行（审计性质，不阻塞功能开发）
