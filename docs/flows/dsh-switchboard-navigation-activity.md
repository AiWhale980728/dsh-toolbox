# DSH Switchboard 导航与活动流程

## 评审目标

这张流程图用于确认进入开发前的信息架构与底层链路：

- 左侧导航保留，负责切换中间功能页。
- 右侧“近期活动”在桌面端跨页面固定，只显示最近活动摘要。
- “查看全部”切换到中间“活动中心”。
- “清除当前会话”必须经过本地 API 和 SQLite，不再只修改 React 内存。
- Profile 健康检查、插件变更、备份、验证和回滚统一生成活动事件。

## 中间功能页

1. Profiles 总览：发现、切换和查看 Profile 健康状态。
2. 插件管理：Bundle 状态、兼容性、预检和计划式变更。
3. 活动中心：全部本地活动、筛选、详情和会话清理。
4. 本地设置：DSH_HOME、数据目录、隐私和版本信息。

## 已实现的数据链路

- 核心操作产生结构化事件。
- 活动 API 将事件写入 SQLite 活动表。
- 右侧近期活动和中间活动中心读取同一数据源。
- 清除操作只作用于当前会话，并要求明确确认。
- 所有写操作继续使用现有同源检查和会话令牌保护。

## 本地源文件

- 导航信息架构：`docs/flows/dsh-switchboard-navigation.mmd`
- 活动数据链路：`docs/flows/dsh-switchboard-activity-data.mmd`
- 第一版全景草图：`docs/flows/dsh-switchboard-navigation-activity.mmd`

## 评审状态

流程已确认并实现。左侧导航切换中间功能页，右侧近期活动跨页面固定；活动中心、会话清理、Profile 健康检查和 Bundle 计划式变更均连接本地 API 与 SQLite 数据链路。
