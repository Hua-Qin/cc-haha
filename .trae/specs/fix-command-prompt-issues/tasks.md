# Tasks

- [x] Task 1: 修复命令分组"创建"按钮不弹窗
  - [x] SubTask 1.1: 在 `CommandManagementSettings` 组件中新增 `showGroupForm` 布尔状态（`useState(false)`）
  - [x] SubTask 1.2: 修改"创建分组"按钮的 `onClick`：设置 `showGroupForm=true`、`editingGroup=null`、`groupNameInput=''`、`groupError=''`
  - [x] SubTask 1.3: 将表单显示条件从 `editingGroup !== null || groupNameInput !== ''` 改为 `showGroupForm || editingGroup !== null`
  - [x] SubTask 1.4: 在"取消"按钮和保存成功后设置 `showGroupForm=false` 关闭表单
  - [x] SubTask 1.5: 编辑分组时也设置 `showGroupForm=true` 以复用同一表单

- [x] Task 2: 实现命令拖拽分组（替换"归属"弹窗）
  - [x] SubTask 2.1: 在 `CommandManagementSettings` 中引入 `@dnd-kit/core` 的 `useDraggable`、`useDroppable`
  - [x] SubTask 2.2: 创建 `DraggableCommandRow` 组件，使用 `useDraggable` hook，添加 `GripVertical` 拖拽手柄
  - [x] SubTask 2.3: 创建 `GroupDropZone` 组件，作为分组卡片的拖拽放置区域（使用 `useDroppable`）
  - [x] SubTask 2.4: 用 `<DndContext>` 包裹命令列表和分组区域，实现 `handleCommandDragEnd` 逻辑
  - [x] SubTask 2.5: 移除 `moveCommandMenu` 状态、`handleMoveButtonClick` 函数、浮动弹出菜单 UI 和每行的 Move 按钮
  - [x] SubTask 2.6: 添加"未分类"放置区域（`useDroppable` id='uncategorized'），支持将命令拖出分组
  - [x] SubTask 2.7: 添加拖拽相关 i18n 翻译条目（`commands.group.dragHint`，5种语言）

- [x] Task 3: 修复提示词优化未登录报错
  - [x] SubTask 3.1: 在 `optimizePrompt` 函数中调用 `queryWithModel` 前增加认证预检（`getAuthTokenSource`、`hasAnthropicApiKeyAuth`、`isUsing3PServices`）
  - [x] SubTask 3.2: 若未认证，抛出友好错误 `ApiError.badRequest("请先登录或在服务商设置中配置 API Key后再使用提示词优化")`
  - [x] SubTask 3.3: 在 `handleOptimizePrompt` catch 块中对认证类错误显示更友好的提示（`chat.optimize.authError`）
  - [x] SubTask 3.4: 添加认证错误的 i18n 翻译条目（5种语言）

- [x] Task 4: 提示词优化功能默认开启
  - [x] SubTask 4.1: `DEFAULT_PROMPT_OPTIMIZATION_SETTINGS.enabled` 从 `false` 改为 `true`
  - [x] SubTask 4.2: `loadOptimizationSettings` 中 `raw.enabled === true` 改为 `raw.enabled !== false`

- [x] Task 5: 验证与测试
  - [x] SubTask 5.1: 验证"创建分组"按钮点击后表单正确显示（showGroupForm 状态修复）
  - [x] SubTask 5.2: 验证命令可拖拽到分组、拖出分组（DndContext + useDraggable + useDroppable）
  - [x] SubTask 5.3: 验证未登录时优化提示词返回友好错误（认证预检）
  - [x] SubTask 5.4: 验证新用户默认可使用提示词优化（enabled=true）
  - [x] SubTask 5.5: TypeScript 类型检查通过（`tsc --noEmit` exit code 0）

# Task Dependencies

- Task 1 和 Task 2 都修改 `CommandManagementSettings` 组件，建议顺序执行（先修复创建按钮，再实现拖拽）
- Task 3 和 Task 4 相互独立，可并行
- Task 5 依赖 Task 1-4 全部完成
