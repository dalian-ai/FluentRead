# 翻译连接错误故障排除指南

## 问题描述
当使用 "custom" 翻译服务时出现 `[custom] Connection error` 错误。

## 已修复的问题

### 1. URL 协议错误
**修复**: 将默认 URL 从 `https://localhost:11434` 改为 `http://localhost:11434`

- **原因**: 本地 Ollama 服务通常使用 HTTP 而非 HTTPS
- **文件**: `entrypoints/utils/constant.ts`

### 2. 增强错误日志
**修复**: 添加了详细的错误诊断信息

- 现在会显示实际尝试连接的 URL
- 提供针对不同错误类型的具体建议
- 更清晰的错误堆栈追踪
- **文件**: `entrypoints/service/unified.ts`


## 如何解决连接错误

### 选项 1: 使用本地 Ollama (推荐用于离线翻译)

1. **安装 Ollama**
   ```bash
   # Windows: 从 https://ollama.ai 下载安装程序
   # 或使用 winget
   winget install Ollama.Ollama
   ```

2. **启动 Ollama 服务**
   ```bash
   ollama serve
   ```

3. **拉取翻译模型**
   ```bash
   # 推荐使用 Qwen 或其他支持中文的模型
   ollama pull qwen2.5:7b
   # 或
   ollama pull llama3.1:8b
   ```

4. **验证服务运行**
   ```bash
   # 在浏览器中访问
   http://localhost:11434/api/tags
   
   # 或使用 curl
   curl http://localhost:11434/api/tags
   ```

5. **在扩展中配置**
   - 服务: custom
   - URL: `http://localhost:11434/v1/chat/completions` (已默认设置)
   - 模型: 你拉取的模型名称 (如 `qwen2.5:7b`)
   - API Key: 留空 (本地不需要)

### 选项 2: 使用其他在线服务

如果不想运行本地服务，可以切换到其他翻译提供商:

#### A. DeepSeek (性价比高)
- 服务: deepseek
- 需要 API Key: https://platform.deepseek.com
- 模型: deepseek-chat

#### B. 智谱 AI (国内稳定)
- 服务: zhipu  
- 需要 API Key: https://open.bigmodel.cn
- 模型: glm-4-flash

#### C. SiliconCloud (免费额度)
- 服务: siliconCloud
- 需要 API Key: https://siliconflow.cn
- 多种模型可选

### 选项 3: 使用自定义 API 端点

如果你有自己的 OpenAI 兼容 API:

1. 在扩展设置中配置:
   - 服务: custom
   - 代理 URL: 你的 API 地址
   - API Key: 你的密钥
   - 模型: 对应的模型名

2. 确保你的 API 兼容 OpenAI 格式:
   ```
   POST /v1/chat/completions
   Content-Type: application/json
   Authorization: Bearer YOUR_API_KEY
   
   {
     "model": "model-name",
     "messages": [
       {"role": "system", "content": "..."},
       {"role": "user", "content": "..."}
     ],
     "response_format": {...}
   }
   ```

## 常见错误及解决方案

### Error: `failed to fetch` 或 `NetworkError`
**原因**: 无法连接到服务器
**解决**:
1. 检查服务是否正在运行 (`ollama serve`)
2. 验证 URL 是否正确 (注意 http vs https)
3. 检查防火墙设置
4. 确认端口 11434 未被占用

### Error: `CORS error`
**原因**: 跨域请求被阻止
**解决**:
1. Ollama 默认支持 CORS，检查是否有其他拦截
2. 确保使用 localhost 而非 127.0.0.1

### Error: `timeout`
**原因**: 服务响应太慢
**解决**:
1. 检查模型是否太大导致加载慢
2. 考虑使用更小的模型
3. 增加系统资源分配

### Error: `401 Unauthorized`
**原因**: API 密钥无效
**解决**:
1. 检查 API Key 是否正确
2. 本地 Ollama 不需要 API Key，留空即可

## 调试步骤

1. **查看控制台日志**
   - 打开扩展的开发者工具
   - 查看详细错误信息，现在会显示:
     - 尝试连接的 URL
     - 错误类型
     - 具体错误消息

2. **手动测试连接**
   ```bash
   # 测试 Ollama 是否运行
   curl http://localhost:11434/api/tags
   
   # 测试聊天 API
   curl http://localhost:11434/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "qwen2.5:7b",
       "messages": [{"role": "user", "content": "Hello"}]
     }'
   ```

3. **检查配置**
   - 打开扩展设置
   - 确认服务类型、URL、模型名称都正确
   - 尝试点击"测试连接"按钮 (如果有)

## 下一步

1. **重新构建扩展**
   ```bash
   npm run build
   # 或
   npm run dev
   ```

2. **重新加载扩展**
   - Chrome: 访问 `chrome://extensions/`
   - 点击"重新加载"按钮

3. **测试翻译**
   - 选择一些文本
   - 查看控制台是否有新的详细错误信息
   - 根据错误提示进行相应调整

## 推荐配置 (本地 Ollama)

```json
{
  "service": "custom",
  "custom": "http://localhost:11434/v1/chat/completions",
  "model": {
    "custom": "qwen2.5:7b"
  },
  "token": {
    "custom": ""
  }
}
```

## 获取帮助

如果问题仍然存在:
1. 检查浏览器控制台的完整错误日志
2. 确认 Ollama 版本: `ollama --version`
3. 查看 Ollama 日志以了解服务端问题
