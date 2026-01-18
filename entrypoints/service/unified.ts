/**
 * 统一的翻译服务 - 使用 Vercel AI SDK
 * 所有provider都通过这个统一接口调用
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';

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

请返回有效的 JSON 对象，结构为：{"translations": [{"index": number, "text": "string"}]}。不要包含任何解释或 markdown 代码块。`;

     const payload = {
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
      extra_body: {
        include_reasoning: false 
      },
      text: {
        format: { type: "json_object" }
      }
    };

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

    const apiResponse = await response.json();

    // 4. 检查是否因token限制被截断
    const finishReason = apiResponse.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('[Frontend] 警告：响应因达到最大token限制而被截断');
    }

    // 5. 提取内容 (多层兼容提取)
    let rawContent = apiResponse.choices?.[0]?.message?.content || 
                     apiResponse.output?.[0]?.content || 
                     apiResponse.content || "";

    if (!rawContent) throw new Error("AI returned empty content");

    // 记录原始内容类型和长度
    console.log('[Frontend] 原始内容类型:', typeof rawContent, '长度:', 
                typeof rawContent === 'string' ? rawContent.length : JSON.stringify(rawContent).length);

    // 6. 处理双层JSON编码问题：有些API会将JSON结果再次序列化成字符串
    // 检查content是否是一个JSON字符串（以 { 开头的字符串）
    if (typeof rawContent === 'string' && rawContent.trim().startsWith('{')) {
      try {
        // 尝试解析一次，看是否是被序列化的JSON
        const possiblyParsed = JSON.parse(rawContent);
        // 如果解析成功且结果是对象，说明确实是双层编码
        if (typeof possiblyParsed === 'object') {
          rawContent = possiblyParsed;
        }
      } catch {
        // 如果解析失败，说明不是双层编码，保持原样
      }
    }

    // 7. 结构化解析 (增强防御力)
    let finalResult;
    try {
      /**
       * ✨ 增强版清洗逻辑
       * 1. 如果rawContent已经是对象，直接使用
       * 2. 移除 Markdown 代码块标记 (包括 json 声明和反引号)
       * 3. 尝试寻找第一个 '{' 和最后一个 '}'，截取中间内容 (处理 AI 前后废话)
       */
      let cleanJson = typeof rawContent === 'object' ? rawContent : String(rawContent).trim();
      
      // 如果已经是对象，跳过字符串清理步骤
      if (typeof cleanJson === 'string') {
        // 处理 ```json ... ``` 结构
        if (cleanJson.includes('```')) {
          cleanJson = cleanJson.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
        }

        // 如果还是解析失败，尝试定位真正的 JSON 边界（防止 AI 输出 "Here is the result: { ... }"）
        const startIndex = cleanJson.indexOf('{');
        const endIndex = cleanJson.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            cleanJson = cleanJson.substring(startIndex, endIndex + 1);
        }
        
        cleanJson = JSON.parse(cleanJson);
      }
      
      finalResult = translationSchema.parse(cleanJson);

    } catch (e) {
      console.warn("[Frontend] JSON 结构化解析失败，启动正则回退...", e);
      console.log("[Frontend] 失败的内容类型:", typeof rawContent);
      console.log("[Frontend] 失败的内容（前500字符）:", String(rawContent).substring(0, 500));

      /**
       * ✨ 增强版正则回退
       * 考虑到 content 内部可能有换行符，匹配模式采用全局搜索
       */
      const translations: { index: number; text: string }[] = [];
      const contentStr = typeof rawContent === 'object' ? JSON.stringify(rawContent) : String(rawContent);
      
      // 方案1: 尝试修复不完整的JSON（如果JSON被截断）
      if (contentStr.includes('"translations"')) {
        try {
          // 提取 translations 数组部分
          const translationsMatch = contentStr.match(/"translations"\s*:\s*\[([\s\S]*?)(?:\]|}|$)/);
          if (translationsMatch) {
            let arrayContent = translationsMatch[1];
            
            // 修复可能不完整的最后一个对象
            // 如果最后没有闭合的 }，尝试补全
            if (!arrayContent.trim().endsWith('}')) {
              const lastComma = arrayContent.lastIndexOf(',');
              if (lastComma > 0) {
                // 截断到最后一个完整的对象
                arrayContent = arrayContent.substring(0, lastComma);
              }
            }
            
            // 构造完整的JSON
            const repairedJson = `{"translations":[${arrayContent}]}`;
            console.log('[Frontend] 尝试修复的JSON:', repairedJson.substring(0, 300));
            
            const parsed = JSON.parse(repairedJson);
            const validated = translationSchema.parse(parsed);
            console.log('[Frontend] ✓ JSON修复成功，提取到', validated.translations.length, '条翻译');
            return JSON.stringify(validated);
          }
        } catch (repairError) {
          console.warn('[Frontend] JSON修复失败:', repairError);
        }
      }
      
      // 方案2: 正则提取
      // 匹配 [数字] 内容，直到下一个 [数字] 或结尾
      const lineRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\s*\[\d+\]|$)/g;
      let match;

      while ((match = lineRegex.exec(contentStr)) !== null) {
        if (match[1] && match[2]) {
          translations.push({
            index: parseInt(match[1], 10),
            text: match[2].trim()
          });
        }
      }

      if (translations.length > 0) {
        console.log('[Frontend] ✓ 正则回退成功，提取到', translations.length, '条翻译');
        finalResult = { translations };
      } else {
        console.error('[Frontend] 完整的不可识别内容:', rawContent);
        throw new Error(`Content unrecognizable: ${String(rawContent).substring(0, 200)}...`);
      }
    }

    // 8. 返回序列化后的标准结果
    return JSON.stringify(finalResult);

  } catch (error: any) {
    console.error('[Frontend] unifiedTranslate Error:', error);
    throw error;
  }
}