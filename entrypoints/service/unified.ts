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
 * 统一翻译函数 (前端实现)
 * 适配后端的 /v1/responses 接口
 */
export async function unifiedTranslate(message: any): Promise<string> {
    try {
        const service = config.service;
        const baseURL = config.proxy[service] || urls[service];
        const apiKey = config.token[service];
        const modelName = getModelName(service);

        // 1. 数据预处理：将待翻译项整理为带 ID 的纯文本字符串
        // 这样即使后端不升级，发送纯字符串也是最安全的兼容做法
        const originText = Array.isArray(message.origin)
            ? message.origin.map((item: any, i: number) => {
                const content = typeof item === 'string' ? item : (item.text || item.input_text || "");
                return `[ID:${i}] ${content}`;
            }).join('\n')
            : String(message.origin);

        // 2. 构造符合后端 handleResponseAPI 期望的 Payload
        const payload = {
            model: modelName,
            provider: service, // 对应后端 selectedProvider 的判断逻辑
            // 直接传字符串，后端会走 if (typeof requestBody.input === 'string') 逻辑
            input: originText, 
            temperature: 0,
            max_tokens: 4000,
            // 对应后端 requestBody.text?.format 逻辑
            text: {
                format: { type: "json_object" }
            }
        };

        console.log(`[Frontend] 发起翻译请求: ${service} -> ${modelName}`);

        // 3. 使用原生 fetch 发起请求
        const response = await fetch(`${baseURL.replace(/\/$/, '')}/responses`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorDetail = await response.text();
            throw new Error(`网络请求失败 (${response.status}): ${errorDetail}`);
        }

        const apiResponse = await response.json();

        // 4. 提取内容
        // 兼容你后端可能返回的各种下游 API 响应格式 (OpenAI 或 Zhipu)
        const rawContent = apiResponse.choices?.[0]?.message?.content || 
                           apiResponse.output?.[0]?.content || 
                           apiResponse.content;

        if (!rawContent) {
            console.error('[Frontend] API 响应异常:', apiResponse);
            throw new Error("AI 未返回翻译内容");
        }

        // 5. 解析 JSON 字符串
        let parsed;
        try {
            // 有些 AI 会在结果里带 ```json 标签，先简单清理
            const cleanJson = typeof rawContent === 'string' 
                ? rawContent.replace(/```json\n?|\n?```/g, '').trim() 
                : rawContent;
            parsed = typeof cleanJson === 'string' ? JSON.parse(cleanJson) : cleanJson;
        } catch (e) {
            throw new Error(`JSON 解析失败: ${rawContent}`);
        }

        // 6. Schema 校验
        const validated = translationSchema.parse(parsed);
        
        // 7. 返回序列化结果给调用方
        return JSON.stringify(validated);

    } catch (error: any) {
        console.error('[Frontend] unifiedTranslate 核心逻辑错误:', error);
        throw error;
    }
}