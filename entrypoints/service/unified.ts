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
 * 统一翻译函数
 * 具备自动修复功能的结构化解析器
 */
export async function unifiedTranslate(message: any): Promise<string> {
    try {
        const service = config.service;
        const baseURL = config.proxy[service] || urls[service];
        const apiKey = config.token[service];
        const modelName = getModelName(service);

        // 1. 构造纯文本输入
        const originText = Array.isArray(message.origin)
            ? message.origin.map((item: any, i: number) => {
                const content = typeof item === 'string' ? item : (item.text || item.input_text || "");
                return `[${i}] ${content}`;
            }).join('\n')
            : String(message.origin);

        // 2. 构造请求 Payload
        const payload = {
            model: modelName,
            provider: service,
            input: originText,
            temperature: 0, // 设为 0 强制模型保持严谨
            text: {
                format: { type: "json_object" }
            }
        };

        const response = await fetch(`${baseURL.replace(/\/$/, '')}/responses`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const apiResponse = await response.json();
        
        // 3. 提取原始文本内容
        const rawContent = apiResponse.choices?.[0]?.message?.content || 
                           apiResponse.output?.[0]?.content || 
                           apiResponse.content || "";

        if (!rawContent) throw new Error("AI returned empty content");

        let validatedData;

        // 4. 尝试解析 (带容错逻辑)
        try {
            // 清理 Markdown 代码块
            const cleanText = typeof rawContent === 'string' 
                ? rawContent.replace(/```json\n?|\n?```/g, '').trim() 
                : rawContent;
            
            const parsed = typeof cleanText === 'string' ? JSON.parse(cleanText) : cleanText;
            validatedData = translationSchema.parse(parsed);

        } catch (e) {
            console.warn("[unified] JSON 解析失败，尝试正则提取...", e);

            // 5. 兜底方案：正则提取模式
            // 匹配类似 "[1] 翻译内容" 的每一行
            const lines = rawContent.split('\n');
            const translations: { index: number; text: string }[] = [];
            
            for (const line of lines) {
                // 正则匹配：以 [数字] 开头的行
                const match = line.match(/^\[(\d+)\]\s*(.*)/);
                if (match) {
                    translations.push({
                        index: parseInt(match[1], 10),
                        text: match[2].trim()
                    });
                }
            }

            if (translations.length > 0) {
                validatedData = { translations };
                console.log(`[unified] 成功通过正则提取了 ${translations.length} 项翻译`);
            } else {
                // 如果正则也提取不到，说明模型彻底胡言乱语了
                throw new Error(`AI 返回内容无法识别: ${rawContent.substring(0, 100)}...`);
            }
        }

        // 6. 返回经过校验的 JSON 字符串
        return JSON.stringify(validatedData);

    } catch (error: any) {
        console.error('[unified] 翻译逻辑崩溃:', error);
        throw error;
    }
}