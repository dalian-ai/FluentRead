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
    const payload = {
      model: modelName,
      provider: service,
      input: [
        {
          role: "system",
          content: "You are a professional translator. Respond ONLY with a valid JSON object. " +
                   "Structure: {\"translations\": [{\"index\": number, \"text\": \"string\"}]}. " +
                   "Do not include any explanations or markdown blocks."
        },
        {
          role: "user",
          content: `Translate the following to Chinese, preserve [index] markers:\n\n${originText}`
        }
      ],
      temperature: 0,
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

    // 4. 提取内容 (多层兼容提取)
    const rawContent = apiResponse.choices?.[0]?.message?.content || 
                       apiResponse.output?.[0]?.content || 
                       apiResponse.content || "";

    if (!rawContent) throw new Error("AI returned empty content");

    // 5. 结构化解析 (增强防御力)
    let finalResult;
    try {
      /**
       * ✨ 增强版清洗逻辑
       * 1. 移除 Markdown 代码块标记 (包括 json 声明和反引号)
       * 2. 尝试寻找第一个 '{' 和最后一个 '}'，截取中间内容 (处理 AI 前后废话)
       */
      let cleanJson = String(rawContent).trim();
      
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
      
      const parsed = JSON.parse(cleanJson);
      finalResult = translationSchema.parse(parsed);

    } catch (e) {
      console.warn("[Frontend] JSON 结构化解析失败，启动正则回退...", e);

      /**
       * ✨ 增强版正则回退
       * 考虑到 content 内部可能有换行符，匹配模式采用全局搜索
       */
      const translations: { index: number; text: string }[] = [];
      // 匹配 [数字] 内容，直到下一个 [数字] 或结尾
      const lineRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\s*\[\d+\]|$)/g;
      let match;

      while ((match = lineRegex.exec(String(rawContent))) !== null) {
        if (match[1] && match[2]) {
          translations.push({
            index: parseInt(match[1], 10),
            text: match[2].trim()
          });
        }
      }

      if (translations.length > 0) {
        finalResult = { translations };
      } else {
        throw new Error(`Content unrecognizable: ${rawContent.substring(0, 100)}`);
      }
    }

    // 6. 返回序列化后的标准结果
    return JSON.stringify(finalResult);

  } catch (error: any) {
    console.error('[Frontend] unifiedTranslate Error:', error);
    throw error;
  }
}