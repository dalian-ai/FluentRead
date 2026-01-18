/**
 * 测试 GLM-4-flashx 的 markdown 包装响应
 */

import { parseFullApiResponse } from './responseParser';

// 实际的 GLM-4-flashx API 响应
const glmResponse = {
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "```json\n{\n  \"translations\": [\n    {\n      \"index\": 1,\n      \"text\": \"但人不是机器。物理科学的专业人士与机器打交道。关于机器，人们所知有限，而专业人士都知道这些。此外，同类的所有机器几乎都差不多，因此它们对任何特定的机器都没有什么兴趣。但人，啊——他们如此复杂，彼此之间又如此不同，以至于社会科学家永远不知道所有需要知道的事情，甚至不知道其中很大一部分。为了理解自己的专业，他必须始终准备研究人；尤其是那些不寻常的样本。\"\n    },\n    {\n      \"index\": 2,\n      \"text\": \"'像我一样，'乔治无表情地说。\"\n    },\n    {\n      \"index\": 3,\n      \"text\": \"我想我不该称你为样本，但你是不同寻常的。你值得研究，如果你允许我享有这种特权，那么如果你遇到麻烦，只要我能，我会帮助你的。\"\n    }\n  ]\n}\n```",
        "role": "assistant"
      }
    }
  ],
  "created": 1768749363,
  "id": "20260118231544fa4a653aea744b6a",
  "model": "glm-4-flashx",
  "object": "chat.completion",
  "request_id": "20260118231544fa4a653aea744b6a",
  "usage": {
    "completion_tokens": 1299,
    "prompt_tokens": 1890,
    "total_tokens": 3189
  }
};

console.log('=== 测试 GLM-4-flashx Markdown 包装响应 ===\n');

const result = parseFullApiResponse(glmResponse, 'test-glm');

if (result.success) {
  console.log('✅ 解析成功!');
  console.log(`✅ 提取了 ${result.data!.translations.length} 个翻译`);
  console.log(`解析方法: ${result.debugInfo?.parseMethod}`);
  console.log('\n前3个翻译:');
  result.data!.translations.slice(0, 3).forEach((t, i) => {
    console.log(`  [${t.index}]: ${t.text.substring(0, 50)}...`);
  });
} else {
  console.error('❌ 解析失败:', result.error);
  if (result.debugInfo) {
    console.error('Debug 信息:', result.debugInfo);
  }
}
