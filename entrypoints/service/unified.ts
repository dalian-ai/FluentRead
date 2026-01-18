/**
 * 统一的翻译服务 - 使用 Vercel AI SDK
 * 所有provider都通过这个统一接口调用
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';
import { parseApiResponse, extractContent } from '@/entrypoints/utils/responseParser';

// 获取模型名称
function getModelName(service: string): string {
    const customModelString = 'custom';
    let model = config.model[service] === customModelString 
        ? config.customModel[service] 
        : config.model[service];
    
    // 删除中文括号
    return model.replace(/（.*）/g, "");
}


// /**
//  * 统一翻译函数
//  */
// export async function unifiedTranslate(message: any): Promise<string> {
//     try {
//         const service = config.service;
//         const modelName = getModelName(service);
        
//         // 1. 初始化 Provider
//         const provider = createOpenAI({
//             baseURL: config.proxy[service] || urls[service],
//             apiKey: config.token[service],
//             compatibility: 'compatible', // 强制使用兼容模式
//         });

//         // 2. 关键修复：彻底清理数据，确保 originContent 只是 String
//         // 这一步手动遍历 origin，提取出文字，杜绝对象进入 Prompt
//         let originContent: string = "";
//         if (Array.isArray(message.origin)) {
//             originContent = message.origin
//                 .map((item: any, i: number) => {
//                     // 显式提取 text 或 input_text，最后转为 String 确保不含对象 key
//                     const val = typeof item === 'string' 
//                         ? item 
//                         : (item.text || item.input_text || JSON.stringify(item));
//                     return `[${i}] ${val}`;
//                 })
//                 .join('\n\n');
//         } else {
//             originContent = typeof message.origin === 'object' 
//                 ? (message.origin.text || JSON.stringify(message.origin)) 
//                 : String(message.origin);
//         }

//         // 3. 构造消息
//         const systemPrompt = `You are a professional translator. Respond ONLY with valid JSON.
// Format: '{"translations": [{"index": number, "text": "string"}]}'`;

//         // 4. 调用 generateText
//         const result = await generateText({
//             model: provider(modelName),
//             // 注意：不要使用 system 和 prompt 属性，直接使用 messages 数组
//             // 且 content 必须传入 String 类型，防止 SDK 包装成对象数组
//             messages: [
//                 {
//                     role: 'system',
//                     content: systemPrompt
//                 },
//                 {
//                     role: 'user',
//                     content: originContent // 这里确保是一个纯 String
//                 }
//             ],
//             // 绝大多数中转支持 json_object，如果报错可尝试注释此行
//             responseFormat: { type: 'json_object' }, 
//             temperature: 0.3,
//         });

//         if (!result.text) {
//             throw new Error("AI returned empty text");
//         }

//         // 5. 解析并利用 Zod 校验
//         const parsed = JSON.parse(result.text);
//         const validated = buildSchema().parse(parsed);
        
//         return JSON.stringify(validated);

//     } catch (error) {
//         console.error(`[unified] 翻译失败 [${config.service}]:`, error);
//         throw error;
//     }
// }


/**
 * 定义批量翻译的校验 Schema
 * 确保 AI 返回的 JSON 格式完全正确
 */
export const translationSchema = z.object({
    translations: z.array(
        z.object({
            index: z.number(),
            text: z.string()
        })
    )
});

/**
 * 统一翻译函数 (适配通用后端网关)
 * 强化了对 Markdown 标签、截断 JSON 以及非标格式的兼容性
 */
export async function unifiedTranslate(message: any): Promise<string> {
  try {
    const service = config.service;
    const baseURL = config.proxy[service] || urls[service];
    const apiKey = config.token[service];
    const modelName = getModelName(service);

    // 1. 预处理文本：添加索引标记
    const originText = Array.isArray(message.origin)
      ? message.origin.map((item: any, i: number) => {
          const content = typeof item === 'string' ? item : (item.text || "");
          return `[${i}] ${content}`;
        }).join('\n')
      : String(message.origin);

    // 2. 构造 Payload (保持 General 设计)
    const systemPrompt = `你是一位在 FinTech 和 AI 领域浸润了十五年的技术人，长期阅读《三联生活周刊》，文字里有知识分子写作的从容和克制。请尊重原意，保持原有格式不变，用简体中文重写下面的内容。

翻译时的文字气质：

1. **科技和金融专业术语保持英文**
   API、LLM、ML、AI、agent、RAG、cloud-native、Transformer、prompt——这些词有其精确的边界，无需汉化
   
2. **节奏要从容**
   - 长短句结合，该舒展时舒展，该收束时收束
   - 不必刻意追求短句，有时一个中长句能把事情说清楚
   - 该停顿的地方自然停顿，别让读者喘不过气
   - 转折用"再比如"、"与此同时"、"所幸"这类自然的词
   
3. **细节要扎实**
   versioned 是"按版本"，proven 是"经过验证"，deep 是"深入"——这些词背后的具体含义要译出来
   数字、时间、地点这类细节不能含糊，它们是文字的骨架
   
4. **语气要克制**
   ❌ "超级厉害" → ✅ "颇具价值"
   ❌ "非常牛" → ✅ "值得注意"
   不煽情，不夸张，让事实说话
   但也不是冷冰冰的，该有温度的地方要有温度
   
5. **消解翻译腔，但保留质感**
   ❌ "为...提供" → ✅ "给..." 或 "让...有了"
   ❌ "AI 代理" → ✅ "AI agent"
   ❌ "该工具能够实现" → ✅ "这工具能" 或 "工具做到了"
   ❌ "通过...的方式" → ✅ 直接说做法
   ❌ "在性能方面有所提升" → ✅ "性能提升了"
   
   少用那些让文字板结的官腔词：该、进行、方面、对于、而言、从而
   但也别矫枉过正，该用书面语的时候还是要用
   
6. **中文的内在逻辑**
   英文的句式结构不必硬搬
   "A fixes B by doing C" 可以译成：
   "A 解决了 B，方法是 C"
   "A 做到了这点：C，于是 B 迎刃而解"
   语序要顺着中文的思维走
   
7. **衔接要自然**
   不总是"因此"、"从而"
   有时用"于是"、"结果"、"所幸"、"与此同时"
   连接词要让文字流动起来，不是机械拼接

你的腔调：专业而不生硬，准确又有温度。像一个既懂技术也懂人文的人在写作，不是在翻译，而是在用中文重新讲述一个故事。

**严格要求 - 必须遵守：**
1. 翻译结果的 text 字段中不要包含序号标记 [1], [2] 等，只返回纯净的翻译文本
2. **禁止输出任何推理过程（reasoning）、思考过程或分析**
3. **这是一个简单的翻译任务，不需要任何额外思考**
4. **只输出纯 JSON 对象**，格式：{"translations": [{"index": number, "text": "翻译文本"}]}
5. **不要输出 markdown 代码块**，不要三个反引号包裹，不要任何解释
6. **立即开始翻译，直接返回 JSON**

输出示例：{"translations":[{"index":0,"text":"示例翻译"},{"index":1,"text":"另一个翻译"}]}`;

     const payload: any = {
      model: modelName,
      provider: service,
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `请将以下带序号的文本翻译成${config.to}，保持 [index] 标记：\n\n${originText}`
        }
      ],
      temperature: 0,
      max_tokens: 4096,  // 限制输出长度，防止超出 token 限制
      stream: false
    };
    
    // 针对不同模型添加禁用 reasoning 的参数
    const modelLower = modelName.toLowerCase();
    
    // Nemotron/Nvidia 模型
    if (modelLower.includes('nemotron') || modelLower.includes('nvidia')) {
      payload.extra_body = {
        reasoning: false,
        include_reasoning: false,
        enable_thinking: false
      };
    }
    
    // OpenAI o1 系列
    if (modelLower.includes('o1')) {
      payload.reasoning_effort = 'low';  // 最低推理级别
      payload.store = false;
    }
    
    // DeepSeek R1 系列
    if (modelLower.includes('deepseek') && modelLower.includes('r1')) {
      payload.reasoning = false;
    }
    
    // 通用 JSON 格式要求（如果模型支持）
    if (!modelLower.includes('claude')) {  // Claude 不支持此参数
      payload.response_format = { type: "json_object" };
    }

    // 3. 发起请求
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Server Error (${response.status}): ${err}`);
    }

    // 提取 CF-Ray 作为 requestId（Cloudflare Workers）
    const cfRay = response.headers.get('cf-ray');
    
    const apiResponse = await response.json();

    // 提取 requestId 用于日志追踪
    // 优先级：CF-Ray header > $workers.requestId > $metadata.requestId > response.id > 'unknown'
    const requestId = cfRay ||
                      apiResponse.$workers?.requestId || 
                      apiResponse.$metadata?.requestId || 
                      apiResponse.id || 
                      'unknown';
    
    console.log(`[Frontend] [RequestId: ${requestId}] 收到响应，开始处理`);

    // 4. 检查是否因token限制被截断
    const finishReason = apiResponse.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn(`[Frontend] [RequestId: ${requestId}] 警告：响应因达到最大token限制而被截断`);
    }

    // 5. 提取并解析内容
    const rawContent = extractContent(apiResponse);

    if (!rawContent) {
      // 提供详细的诊断信息
      console.error(`[Frontend] [RequestId: ${requestId}] AI返回空内容，完整响应:`, {
        requestId,
        finishReason,
        hasChoices: !!apiResponse.choices,
        choicesLength: apiResponse.choices?.length,
        firstChoice: apiResponse.choices?.[0],
        fullResponse: apiResponse
      });
      throw new Error(`AI returned empty content (RequestId: ${requestId})`);
    }

    console.log(`[Frontend] [RequestId: ${requestId}] 开始解析响应...`);
    
    // 6. 使用独立的响应解析器
    const parseResult = parseApiResponse(rawContent, requestId);
    
    if (!parseResult.success) {
      console.error(`[Frontend] [RequestId: ${requestId}] 解析失败:`, parseResult.error);
      console.error(`[Frontend] [RequestId: ${requestId}] 原始内容（前500字符）:`, String(rawContent).substring(0, 500));
      throw new Error(`Failed to parse response (RequestId: ${requestId}): ${parseResult.error}`);
    }
    
    console.log(`[Frontend] [RequestId: ${requestId}] ✓ 解析成功，返回 ${parseResult.data!.translations.length} 条结果`);
    console.log(`[Frontend] [RequestId: ${requestId}] 解析方法: ${parseResult.debugInfo?.parseMethod}`);
    
    // 7. 返回结果（包含 metadata）
    const resultWithMetadata = {
      ...parseResult.data,
      _metadata: { requestId }
    };
    
    return JSON.stringify(resultWithMetadata);

  } catch (error: any) {
    console.error('[Frontend] unifiedTranslate Error:', error);
    throw error;
  }
}