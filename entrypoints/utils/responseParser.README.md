# Response Parser 模块

## 概述

`responseParser.ts` 是一个独立的响应解析模块，专门用于处理 AI 翻译 API 返回的各种格式的响应数据。该模块已从 `unified.ts` 中抽取出来，具有完整的测试覆盖和独立的测试能力。

## 文件结构

```
entrypoints/utils/
├── responseParser.ts          # 核心解析逻辑
├── responseParser.test.ts     # 测试套件
└── responseParser.README.md   # 本文档
```

## 核心功能

### 1. JSON 清理 (`cleanJsonString`)
清理 AI 返回的 JSON 字符串，移除：
- Markdown 代码块标记（```json 等）
- 前后空白字符
- AI 添加的额外说明文字

### 2. 响应解析 (`parseApiResponse`)
多级解析策略，按优先级尝试：
1. **直接解析**：标准 JSON 格式
2. **JSON 修复**：尝试修复截断或不完整的 JSON
3. **正则回退**：使用正则表达式提取 `[数字] 内容` 格式

### 3. 序号标记移除 (`removeIndexMarkers`)
自动移除翻译文本中的 `[1]`, `[2]` 等序号标记。

### 4. 内容提取 (`extractContent`)
从多种 API 响应格式中提取 content 字段：
- `choices[0].message.content` (OpenAI 格式)
- `output[0].content` (其他格式)
- `content` (直接格式)

**重要**：自动忽略 `reasoning` 字段（推理模型如 OpenAI o1、GLM-4.5、DeepSeek R1 等）

### 5. 完整响应处理 (`parseFullApiResponse`)
一步到位处理完整的 API 响应对象（推荐使用）：
1. 提取 content（自动忽略 reasoning）
2. 解析并验证
3. 返回完整的解析结果

## 使用方法

### 在代码中使用

**方式 1：分步处理**

**方式 1：分步处理**

```typescript
import { parseApiResponse, extractContent } from '@/entrypoints/utils/responseParser';

// 提取内容
const content = extractContent(apiResponse);

// 解析内容
const result = parseApiResponse(content, requestId);

if (result.success) {
  console.log('翻译数量:', result.data.translations.length);
  console.log('解析方法:', result.debugInfo?.parseMethod);
} else {
  console.error('解析失败:', result.error);
}
```

**方式 2：一步到位（推荐）**

```typescript
import { parseFullApiResponse } from '@/entrypoints/utils/responseParser';

// 完整的 API 响应对象（包含 choices、message 等）
const apiResponse = await fetch(...).then(r => r.json());

// 一步完成提取和解析
const result = parseFullApiResponse(apiResponse, requestId);

if (result.success) {
  console.log('翻译:', result.data.translations);
} else {
  console.error('错误:', result.error);
}
```

### 运行测试

```bash
# 运行完整测试套件
npx tsx entrypoints/utils/responseParser.test.ts

# 使用 npm script（如果已配置）
npm run test:parser
```

## 测试用例

测试套件包含 15 个测试用例，覆盖：

✅ **成功场景**
- 标准 JSON 格式
- 带 Markdown 代码块
- 带序号标记（自动清理）
- 前后有额外文本
- 嵌套格式
- 对象格式（非字符串）
- 正则回退格式
- 空翻译数组
- 用户真实案例（17条翻译）
- **带 reasoning 字段（推理模型）**
- **完整 API 响应对象**

✅ **失败场景**
- 截断的 JSON（不完整）
- 缺少 translations 字段
- 完全无效的内容
- 格式错误的 JSON
- 多余的逗号

## 推理模型支持

### 什么是 Reasoning 模型？

某些 AI 模型（如 OpenAI o1、GLM-4.5、DeepSeek R1 等）会在响应中包含 `reasoning` 字段，展示 AI 的思考过程。

### 响应格式示例

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "{\"translations\": [...]}",
      "reasoning": "我需要将这段英文内容翻译成简体中文...",
      "reasoning_details": [...]
    }
  }]
}
```

### 处理方式

`extractContent` 函数**仅提取 `content` 字段，自动忽略 `reasoning` 字段**，确保翻译结果不包含 AI 的思考过程。

```typescript
// ✅ 正确：只提取翻译结果
const content = extractContent(apiResponse); 
// content = "{\"translations\": [...]}"

// ❌ 错误的做法：不要手动提取 reasoning
const wrong = apiResponse.choices[0].message.reasoning; // 这是思考过程，不是翻译结果
```

## API 参考

### `extractContent(apiResponse)`

从 API 响应中提取 content 字段。

**参数：**
- `apiResponse: any` - API 响应对象

**返回值：**
- `string` - 提取的内容，或空字符串

**注意：** 自动忽略 `reasoning` 字段（推理模型）

---

### `parseApiResponse(rawContent, requestId?)`

解析 API 响应内容。

**参数：**
- `rawContent: string | object` - 原始响应内容
- `requestId: string` - 可选的请求 ID，用于日志追踪

**返回值：**
```typescript
interface ParseResult {
  success: boolean;
  data?: {
    translations: Array<{
      index: number;
      text: string;
    }>;
  };
  error?: string;
  debugInfo?: {
    rawContentType: string;
    cleanedContent?: string;
    parseMethod: 'direct' | 'json-repair' | 'regex-fallback';
  };
}
```

---

### `parseFullApiResponse(apiResponse, requestId?)`

完整的 API 响应处理（提取 + 解析）。**推荐使用**

**参数：**
- `apiResponse: any` - 完整的 API 响应对象（包含 choices、message 等）
- `requestId: string` - 可选的请求 ID，用于日志追踪

**返回值：** 同 `parseApiResponse`

**示例：**
```typescript
const apiResponse = await fetch(...).then(r => r.json());
const result = parseFullApiResponse(apiResponse, 'req-123');
```

---

### `extractContent(apiResponse)`

从 API 响应中提取 content 字段。

**参数：**
- `apiResponse: any` - API 响应对象

**返回值：**
- `string` - 提取的内容，或空字符串

### `cleanJsonString(rawContent)`

清理 JSON 字符串。

**参数：**
- `rawContent: string` - 原始 JSON 字符串

**返回值：**
- `string` - 清理后的 JSON 字符串

## 调试信息

解析结果中的 `debugInfo` 提供了详细的调试信息：

- `rawContentType`: 原始内容类型（'string' | 'object'）
- `cleanedContent`: 清理后的内容（前 200 字符）
- `parseMethod`: 使用的解析方法
  - `'direct'`: 直接 JSON 解析成功
  - `'json-repair'`: 通过修复截断 JSON 成功
  - `'regex-fallback'`: 通过正则表达式提取成功

## 集成说明

### 在 unified.ts 中的使用

```typescript
import { parseFullApiResponse } from '@/entrypoints/utils/responseParser';

// 获取完整的 API 响应
const apiResponse = await response.json();

// 一步完成：提取 content（忽略 reasoning）+ 解析 + 验证
const parseResult = parseFullApiResponse(apiResponse, requestId);

if (!parseResult.success) {
  throw new Error(`Failed to parse response: ${parseResult.error}`);
}

// 添加 metadata 并返回
const resultWithMetadata = {
  ...parseResult.data,
  _metadata: { requestId }
};

return JSON.stringify(resultWithMetadata);
```

## 贡献指南

### 添加新的测试用例

在 `responseParser.test.ts` 中添加：

```typescript
{
  name: "你的测试名称",
  input: "测试输入",
  expectedSuccess: true/false,
  expectedCount: 期望的翻译数量,
  description: "测试说明"
}
```

### 添加新的解析策略

在 `parseApiResponse` 函数中添加新的 try-catch 块，并更新 `parseMethod` 类型定义。

## 性能考虑

- 解析器按优先级尝试不同策略，成功后立即返回
- 正则回退是最后的手段，性能略低但覆盖面广
- 所有错误都会被捕获并记录，不会影响其他解析策略

## 已知限制

1. **严重截断的 JSON** 无法恢复（如字符串值被截断在中间）
2. **中文引号** 会导致 JSON 解析失败（需要使用英文引号 `""`）
3. **正则回退** 依赖 `[数字] 内容` 格式，其他格式无法识别
4. **Reasoning 字段** 自动被忽略（只使用 content），如需保留需修改代码

## 更新日志

### v1.1.0 (2026-01-18)
- ✅ 添加 `parseFullApiResponse` 函数（一步到位）
- ✅ 支持推理模型的 reasoning 字段（自动忽略）
- ✅ 新增 2 个测试用例（reasoning 相关）
- ✅ 更新文档说明 reasoning 处理方式

### v1.0.0 (2026-01-18)
- 从 unified.ts 中抽取独立模块
- 添加完整的测试套件
- 支持多级解析策略
- 自动移除序号标记
- 改进 JSON 修复逻辑
