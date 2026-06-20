# 命令分组与提示词优化 Bug 修复 Spec

## Why

命令管理中的分组创建按钮无法弹出表单、命令分组依赖"归属"弹窗而非直观的拖拽操作、提示词优化在未登录时报错信息不友好、以及提示词优化功能默认未开启，这些问题严重影响用户体验。本次变更修复这些功能异常并优化交互逻辑。

## What Changes

### 1. 修复命令分组"创建"按钮不弹窗（BUG）
- **根因**: `CommandManagementSettings` 组件中"创建分组"按钮的 `onClick` 清空了 `editingGroup=null` 和 `groupNameInput=''`，但表单显示条件为 `editingGroup !== null || groupNameInput !== ''`，导致两者皆空时表单不显示。
- **修复**: 引入独立的 `showGroupForm` 布尔状态控制表单的显示/隐藏，使"创建分组"按钮能正确展开表单。

### 2. 将命令"归属"方式改为直接拖拽（交互重构）
- **现状**: 命令分配到分组通过 "Move" 按钮 + 浮动弹出菜单完成（`moveCommandMenu` 状态 + `handleMoveButtonClick`）。
- **变更**: 移除 "Move" 弹窗机制，改用 @dnd-kit 拖拽（复用 `ProviderSettings` 中已有的 `DndContext`/`SortableContext`/`useSortable` 模式），支持：
  - 将命令拖入自定义分组
  - 在分组内拖拽排序
  - 将命令拖出分组（移至"未分类"）

### 3. 修复提示词优化未登录报错（BUG）
- **根因**: `optimizePrompt` → `queryWithModel` 隐式走认证流程，未登录时返回 401，被 `errors.ts` 规范化为 "Not logged in · Please run /login"，再被包装为 "Prompt optimization failed: ..."，用户看到的错误信息不清晰。
- **修复**: 在调用 `queryWithModel` 前增加认证状态预检，若未登录则返回明确的引导错误（提示用户先登录或配置 API Key），而非等到模型调用失败。

### 4. 提示词优化功能默认开启（配置调整）
- **现状**: `DEFAULT_PROMPT_OPTIMIZATION_SETTINGS.enabled = false`，用户需手动到设置中开启才能使用。
- **变更**: 将默认值改为 `true`，使用户无需任何配置即可直接使用提示词优化功能。

## Impact

- **Affected specs**: `enhance-prompt-skill-command-providers`（前一阶段的实现）
- **Affected code**:
  - `desktop/src/pages/Settings.tsx` — `CommandManagementSettings` 组件（lines 4261-4720）、提示词优化设置区块（lines 3115-3190）
  - `desktop/src/stores/settingsStore.ts` — `DEFAULT_PROMPT_OPTIMIZATION_SETTINGS`（line 173）
  - `src/server/api/promptOptimize.ts` — `loadOptimizationSettings`（line 138）、`optimizePrompt`（line 182）
  - `desktop/src/components/chat/ChatInput.tsx` — `handleOptimizePrompt`（line 602）错误处理
  - `desktop/src/i18n/locales/` — 新增/修改翻译条目

## MODIFIED Requirements

### Requirement: 命令分组创建表单
点击"创建分组"按钮 SHALL 立即显示分组名称输入表单（包含输入框和保存/取消按钮）。表单的显示/隐藏 SHALL 由独立的 `showGroupForm` 状态控制，不再依赖 `groupNameInput` 是否为空。

#### Scenario: 创建分组
- **WHEN** 用户点击"创建分组"按钮
- **THEN** 分组名称输入表单立即出现
- **AND** 用户输入名称后点击"保存"，分组创建成功
- **AND** 用户点击"取消"，表单关闭

### Requirement: 命令拖拽分组
命令分配到分组 SHALL 通过拖拽操作完成，而非弹出菜单。系统 SHALL 使用 @dnd-kit 实现拖拽，支持将命令拖入/拖出分组。

#### Scenario: 拖拽命令到分组
- **WHEN** 用户拖拽一个命令到某个自定义分组上方并释放
- **THEN** 该命令被分配到目标分组
- **AND** 源位置（若为其他分组）移除该命令

#### Scenario: 拖拽命令到未分类
- **WHEN** 用户将命令拖出分组区域
- **THEN** 该命令变为"未分类"状态

### Requirement: 提示词优化认证预检
提示词优化 API（`/api/prompt-optimize`）SHALL 在调用模型前检查用户认证状态。若用户未登录或未配置有效的 API Key，SHALL 返回明确的引导信息。

#### Scenario: 未登录时优化
- **WHEN** 未登录用户点击"优化提示词"按钮
- **THEN** 返回友好错误提示（如"请先登录或在服务商设置中配置 API Key"）
- **AND** 不发起模型调用，不产生无效请求

### Requirement: 提示词优化默认启用
提示词优化功能 SHALL 默认为启用状态（`enabled: true`）。用户无需手动开启即可直接使用"优化提示词"按钮。

#### Scenario: 首次使用
- **WHEN** 新用户（从未修改过设置）打开应用
- **THEN** 提示词优化功能已默认启用
- **AND** 输入框中的"优化提示词"按钮可直接点击使用
