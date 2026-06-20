# 提示词优化 · AI提示配置 · 服务商 · 技能安装 · 命令管理 增强规格

## Why

当前 cc-haha 桌面端在提示词优化、技能在线安装、命令管理等方面存在功能空白或体验不足：输入框缺少 AI 提示词优化能力；技能模块仅支持只读列表，无在线安装；命令系统缺少分类管理与置顶；服务商管理对默认服务商的编辑/删除支持不完整；思考过程可视化需要增强。本次变更旨在补齐这些能力，提升用户的工作效率和产品完整度。

## What Changes

### 1. 提示词优化功能（新增）
- 在 `ChatInput.tsx` 工具栏中新增"优化提示词"按钮，点击后基于当前对话上下文调用 AI 进行提示词优化
- 在 `GeneralSettings`（`Settings.tsx`）中新增"AI 提示词优化"配置区块，支持自定义优化提示词内容和参数（模型、temperature 等）
- 优化调用经由现有代理（proxy）链路，自动记录到 Trace 系统（原始/优化后提示词、时间、上下文）
- 优化产生的 tokens 消耗通过现有 `cost-tracker.ts` 的 `addToTotalSessionCost` 准确统计
- 优化时读取当前会话消息历史作为上下文，保持连贯性

### 2. AI 默认提示配置（审计 + 增强）
- 审计 `src/constants/prompts.ts`、`src/utils/systemPrompt.ts` 中所有默认提示配置（系统提示词、角色提示词、权限提示词等）
- 验证提示词切换功能（含"跳过模式"——即 `overrideSystemPrompt` / `customSystemPrompt` 路径），确保切换后行为符合预期
- 增强思考过程可视化：当 AI 进入思考阶段时，实时展示思考内容流（当前 `ThinkingBlock.tsx` 已支持流式展示，需确保所有思考路径都正确触发流式事件，而非仅显示"思考中"占位）

### 3. 服务商配置（增强）
- 确保所有已配置服务商（包括系统默认/官方服务商）均可在 `ProviderSettings` 中进行编辑和删除
- 清理冗余/过期/不再使用的服务商预设（`providerPresets.json`）
- 为删除操作增加确认对话框（`ProviderFormModal` / `SortableProviderCard` 中），防止误操作

### 4. 技能管理功能（新增在线安装）
- 在 `SkillSettings`（`Settings.tsx`）中新增"在线安装技能"入口和安装流程
- 实现安全的技能安装机制：技能源验证、权限检查（allowed-tools 审查）、完整性校验（SKILL.md frontmatter 解析与 schema 验证）
- 提供清晰的安装进度反馈、成功/失败提示及后续操作指引

### 5. 命令管理系统（增强）
- 输入框斜杠("/")命令触发已存在（`composerUtils.ts`），需验证并确保稳定
- 在设置中新增"命令管理"（`/管理`）配置模块，作为新的 Settings Tab
- 支持命令分类管理（builtin / skill / plugin / mcp 等）和置顶设置
- 置顶命令实时反映在输入框命令建议列表中（优先显示）
- 验证命令分类在输入框选择界面中准确显示和区分

### 6. 部署
- 将代码同步至 GitHub 仓库 `https://github.com/Hua-Qin/cc-haha`
- 执行 Windows x86（ia32）架构的应用构建

## Impact

- **Affected specs**: 无既有 spec（本次为首份）
- **Affected code**:
  - 前端（desktop/src）: `components/chat/ChatInput.tsx`, `components/chat/composerUtils.ts`, `components/chat/ThinkingBlock.tsx`, `pages/Settings.tsx`, `stores/settingsStore.ts`, `stores/uiStore.ts`, `api/settings.ts`, `api/skills.ts`, `api/providers.ts`, `types/settings.ts`, `types/skill.ts`, `i18n/locales/`
  - 后端（src/）: `server/api/settings.ts`, `server/api/skills.ts`, `server/api/providers.ts`, `server/services/settingsService.ts`, `server/services/providerService.ts`, `server/config/providerPresets.json`, `constants/prompts.ts`, `utils/systemPrompt.ts`, `cost-tracker.ts`, `skills/loadSkillsDir.ts`
  - 构建/部署: `desktop/package.json`, `desktop/scripts/build-windows-x64.ps1`

## ADDED Requirements

### Requirement: AI 提示词优化
系统 SHALL 在聊天输入框工具栏提供"优化提示词"按钮，点击后基于当前会话上下文调用 AI 优化用户输入的提示词。

#### Scenario: 用户优化提示词
- **WHEN** 用户在输入框中输入文本并点击"优化提示词"按钮
- **THEN** 系统读取当前会话消息历史作为上下文，调用 AI（使用优化专用配置）对输入文本进行优化
- **AND** 优化完成后，输入框内容替换为优化后的文本
- **AND** 优化过程中的 tokens 消耗被准确统计到会话成本
- **AND** 优化操作被完整记录到 Trace 系统

#### Scenario: 优化配置自定义
- **WHEN** 用户在 设置 → 通用 → AI 提示词优化 中修改优化提示词内容或参数
- **THEN** 后续优化操作使用新的自定义配置

### Requirement: 技能在线安装
系统 SHALL 在设置 → 技能管理中提供"在线安装技能"入口，支持从指定源（URL 或本地路径）安装技能。

#### Scenario: 安装技能
- **WHEN** 用户点击"在线安装技能"并输入技能源地址
- **THEN** 系统执行：源验证 → 下载 → SKILL.md frontmatter 解析 → 权限检查（allowed-tools 审查）→ 完整性校验 → 安装到 `~/.claude/skills/`
- **AND** 全程显示安装进度反馈
- **AND** 安装成功后技能列表自动刷新

#### Scenario: 安装失败
- **WHEN** 技能源无效或权限检查未通过
- **THEN** 显示明确的失败原因和后续操作指引
- **AND** 不写入任何文件到技能目录

### Requirement: 命令管理模块
系统 SHALL 在设置中提供"命令管理"配置模块，支持命令分类查看和置顶设置。

#### Scenario: 置顶命令
- **WHEN** 用户在 命令管理 中将某命令标记为"置顶"
- **THEN** 输入框的斜杠命令建议列表中该命令优先显示（排在最前）
- **AND** 置顶设置持久化到用户设置

#### Scenario: 命令分类显示
- **WHEN** 用户在输入框输入 `/` 触发命令列表
- **THEN** 命令按分类（内置/技能/插件/MCP）分组或标注显示

### Requirement: 服务商删除确认
系统 SHALL 在删除任何服务商（包括默认服务商）前显示确认对话框。

#### Scenario: 删除服务商
- **WHEN** 用户点击删除服务商按钮
- **THEN** 弹出确认对话框，显示服务商名称和影响说明
- **AND** 仅在用户确认后执行删除

## MODIFIED Requirements

### Requirement: 服务商编辑/删除权限
所有已配置的服务商（包括系统默认服务商）SHALL 支持完整的编辑和删除操作。此前若默认服务商的编辑/删除受限， SHALL 移除该限制。

### Requirement: 思考过程可视化
当系统进入 AI 思考阶段时，SHALL 向用户实时流式展示思考内容（通过 `ThinkingBlock` 组件），而非仅显示静态"思考中"状态。所有触发思考的代码路径 SHALL 正确发出 `{ type: 'thinking'; text }` 流式事件。

### Requirement: 默认提示配置完整性
系统中的所有 AI 默认提示配置（系统提示词、角色提示词、权限提示词等）SHALL 经过端到端逻辑审计，确认不存在逻辑矛盾或功能缺陷。提示词切换功能（包括跳过模式）SHALL 稳定可用。

## REMOVED Requirements

### Requirement: 冗余服务商预设
**Reason**: `providerPresets.json` 中存在冗余、过期或不再使用的服务商预设，需清理
**Migration**: 仅移除经确认不再使用的预设；已被用户实例化的服务商数据不受影响
