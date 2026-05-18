# carocut + opencode 技术笔记

## opencode 二进制

- 路径：`/home/eddellar/.opencode/bin/opencode`
- 版本：v1.4.7
- 安装方式：官方安装脚本 `curl -fsSL https://opencode.ai/install | bash`（可能超时但二进制通常已存在）

## opencode.json 模型配置

carocut 官方模板 `opencode-template.json` 配置了不可用的模型，需要替换：

```json
{
  "model": "minimax-cn-coding-plan/MiniMax-M2.7-highspeed",
  "small_model": "minimax-cn-coding-plan/MiniMax-M2",
  "agent": {
    "carocut-reviewer": {
      "model": "minimax-cn-coding-plan/MiniMax-M2.7-highspeed"
    }
  }
}
```

注意：某些 carocut agent 在模板中硬编码了专用模型（如 `carocut-reviewer` 用 `opencode/mimo-v2-omni-free`），这些也需要同步替换。

## opencode run vs serve

| 模式 | 命令 | 行为 | 限制 |
|------|------|------|------|
| 单轮 | `opencode run "message"` | 发一条消息，立即返回 | 无法多轮 agent 调度，60s 超时 |
| 服务 | `opencode serve` | 启动 HTTP server on :4096 | HTTP API 未测试成功（可能是认证问题） |

## carocut orchestrator 工作流

8 步流水线，orchestrator 调度 4 个 subagent：
- `carocut-planner` — 素材分析 + 策划文档（step 1-3）
- `carocut-media` — 图片/音频素材获取（step 4-5）
- `carocut-builder` — Remotion 工程管理（step 6-7）
- `carocut-reviewer` — 预览与渲染（step 8）

核心问题：subagent 调度是嵌套式多轮对话，`opencode run` 单轮模式无法支持。

## Bootstrap 绕过

carocut bootstrap 检查 Remotion 模板环境，但我们的 pipeline 不使用 Remotion。绕过方法：

```bash
mkdir -p /mnt/e/carocut/.carocut
cat > /mnt/e/carocut/.carocut/bootstrap.yaml << 'EOF'
status: completed
timestamp: "2025-01-01T00:00:00Z"
template_cache_path: ".carocut/template-cache"
template_source_hash: "dummy_hash_for_testing"
EOF
```

## carocut API 路由（Next.js）

```
/app/api/agent/abort/route.ts       # 中止任务
/app/api/agent/agents/route.ts      # subagent 列表
/app/api/agent/command/route.ts     # 单条命令
/app/api/agent/commands/route.ts    # 批量命令
/app/api/agent/events/route.ts       # SSE 事件流
/app/api/agent/messages/route.ts     # 消息
/app/api/agent/pending/route.ts      # 待处理任务
/app/api/agent/permission/route.ts  # 权限
/app/api/agent/prompt/route.ts       # prompt
/app/api/agent/question/route.ts     # 问答
/app/api/agent/session/route.ts     # 会话
/app/api/agent/subagent-tokens/route.ts  # subagent token
```

这些是 carocut Next.js server 的 API 端点。如果要实现方案B（serve 模式），需要研究这些端点的请求/响应格式，以及 opencode server 的认证机制。

## 实用命令

```bash
# 单次创意脑暴（轻量方案B）
cd /mnt/e/carocut
opencode run "为素笺漫拾策划一个18秒禅意茶道视频，720x1280竖屏" 2>&1

# 验证 opencode 可用
opencode models

# 启动 opencode server（后台）
opencode serve

# 测试 server 响应
curl http://127.0.0.1:4096/
# 应返回 OpenCode web UI HTML
```
