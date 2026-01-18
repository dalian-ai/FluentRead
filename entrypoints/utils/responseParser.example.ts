/**
 * responseParser 使用示例
 * 演示如何处理带 reasoning 字段的 API 响应
 */

import { parseFullApiResponse } from './responseParser';

// 示例 1：用户提供的真实响应（带 reasoning 字段）
const exampleReasoningResponse = {
  "id": "gen-1768745796-W3U28ylmhnbbE7JJDio0",
  "provider": "Z.AI",
  "model": "z-ai/glm-4.5-air:free",
  "object": "chat.completion",
  "created": 1768745796,
  "choices": [
    {
      "logprobs": null,
      "finish_reason": "stop",
      "native_finish_reason": "stop",
      "index": 0,
      "message": {
        "role": "assistant",
        "content": JSON.stringify({
          translations: [
            { index: 0, text: "Stratechery Plus" },
            { index: 1, text: "更新" },
            { index: 2, text: "与联合航空CEO斯科特·柯比谈技术转型" },
            { index: 3, text: "Meta计算、Meta与OpenAI之争、现实实验室的牺牲" },
            { index: 4, text: "苹果与Gemini、基础模型vs聚合模式、通用商业协议" },
            { index: 5, text: "查看全部" }
          ]
        }),
        "refusal": null,
        "reasoning": "\n我需要将这段英文内容翻译成简体中文...",
        "reasoning_details": [
          {
            "format": "unknown",
            "index": 0,
            "type": "reasoning.text",
            "text": "详细的推理过程..."
          }
        ]
      }
    }
  ],
  "$workers": {
    "requestId": "9bfeb606b99a3783"
  }
};

// 使用 parseFullApiResponse 处理
console.log('========================================');
console.log('示例 1：处理带 reasoning 的响应');
console.log('========================================\n');

const result1 = parseFullApiResponse(
  exampleReasoningResponse, 
  exampleReasoningResponse.$workers.requestId
);

if (result1.success) {
  console.log('✅ 解析成功！');
  console.log(`翻译数量: ${result1.data!.translations.length}`);
  console.log(`解析方法: ${result1.debugInfo?.parseMethod}`);
  console.log('\n翻译结果:');
  result1.data!.translations.forEach(t => {
    console.log(`  [${t.index}] ${t.text}`);
  });
} else {
  console.log('❌ 解析失败:', result1.error);
}

// 示例 2：标准响应（无 reasoning）
console.log('\n========================================');
console.log('示例 2：处理标准响应（无 reasoning）');
console.log('========================================\n');

const exampleStandardResponse = {
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": JSON.stringify({
          translations: [
            { index: 0, text: "Hello World" },
            { index: 1, text: "你好世界" }
          ]
        })
      },
      "finish_reason": "stop"
    }
  ]
};

const result2 = parseFullApiResponse(exampleStandardResponse, 'test-123');

if (result2.success) {
  console.log('✅ 解析成功！');
  console.log(`翻译数量: ${result2.data!.translations.length}`);
  result2.data!.translations.forEach(t => {
    console.log(`  [${t.index}] ${t.text}`);
  });
}

// 示例 3：直接处理 content 字符串
console.log('\n========================================');
console.log('示例 3：直接处理 content 字符串');
console.log('========================================\n');

import { parseApiResponse } from './responseParser';

const contentString = `
{
  "translations": [
    {"index": 0, "text": "第一段"},
    {"index": 1, "text": "第二段"}
  ]
}
`;

const result3 = parseApiResponse(contentString, 'direct-test');

if (result3.success) {
  console.log('✅ 解析成功！');
  console.log(`解析方法: ${result3.debugInfo?.parseMethod}`);
  console.log(`翻译数量: ${result3.data!.translations.length}`);
}

console.log('\n========================================');
console.log('所有示例执行完成！');
console.log('========================================');
