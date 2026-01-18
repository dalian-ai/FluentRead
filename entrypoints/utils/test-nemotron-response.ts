/**
 * 测试 Nemotron 模型返回的畸形响应
 */

import { parseFullApiResponse } from './responseParser';

// 从用户提供的真实响应中提取
const nemotronResponse = {
  "id": "gen-1768747152-d5Mg00ZeZwqXo6re2obf",
  "provider": "Nvidia",
  "model": "nvidia/nemotron-3-nano-30b-a3b:free",
  "object": "chat.completion",
  "created": 1768747152,
  "choices": [
    {
      "logprobs": null,
      "finish_reason": "length",
      "native_finish_reason": "length",
      "index": 0,
      "message": {
        "role": "assistant",
        "content": `{
  "translations": [
    {
      "index": 1,
      "text": "技术博客"
    },
    {
      "index": 2,
      "text": "工程"
    },
    {
      "index": 3,
      "text": "数据科学"
    },
    {
      "index": 4,
      "text": "设计"
    },
    {
      "index": 5,
      "text": "产品"
    },
    {
      "index": 6,
      "text": "安全"
    },
    {
      "index": 7,
      "text": "工程"
    },
    {
      "index": 8,
      "text": "数据科学"
    },
    {
      "index": 9,
      "text": "设计"
    },
    {
      "index": 10,
      "text": "产品"
    },
    {
      "index": 11,
      "text": "安全"
    },
    {
      "index": 12,
      "text": "工程"
    },
    {
      "index": 13,
      "text": "从部署松弛到生产现实：BriX 如何以企业级 AI 基础设施弥合差距"
    },
    {
      "index": 14,
      "text": "Sneh Agrawal · Rishi Raj · Kartik Srinivasan · Eddy Lim · Aseem Kumar · Heber Ng 2026年1月16日 | 阅读 19 分钟"
    },
    {
      "index": 15,
      "text": "摘要"
    },
    {
      "index": 16,
      "text": "你为团队打造的 AI 助手曾是一款改变游戏的利器，在笔记本上运行如臂extension。可当你尝试将其全公司部署时，一切便崩塌。"
    },
    {
      "index": 1`,
        "refusal": null,
        "reasoning": "Very long reasoning text omitted for brevity..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 2116,
    "completion_tokens": 8192,
    "total_tokens": 10308,
    "reasoning_tokens": 8541
  }
};

console.log('\n=== 测试 Nemotron 畸形响应解析 ===\n');

const result = parseFullApiResponse(nemotronResponse, 'test-nemotron-001');

if (result.success && result.data) {
  console.log('✅ 解析成功!');
  console.log(`✅ 提取了 ${result.data.translations.length} 个翻译`);
  console.log('\n翻译内容:');
  result.data.translations.forEach((t, i) => {
    console.log(`  [${t.index}] ${t.text.substring(0, 50)}${t.text.length > 50 ? '...' : ''}`);
  });
  
  if (result.debugInfo) {
    console.log(`\n解析方法: ${result.debugInfo.parseMethod}`);
  }
} else {
  console.log('❌ 解析失败:', result.error);
  if (result.debugInfo) {
    console.log('\n调试信息:');
    console.log('  原始类型:', result.debugInfo.rawContentType);
    console.log('  解析方法:', result.debugInfo.parseMethod);
    if (result.debugInfo.cleanedContent) {
      console.log('  清理后内容 (前200字符):', result.debugInfo.cleanedContent.substring(0, 200));
    }
  }
}

console.log('\n=== 测试完成 ===\n');
