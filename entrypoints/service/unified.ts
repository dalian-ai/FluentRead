/**
 * 统一的翻译服务 - 使用OpenAI兼容API
 * 所有provider都通过这个统一接口调用
 */

import OpenAI from 'openai';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';
import { services } from '../utils/option';
import { contentPostHandler } from '@/entrypoints/utils/check';

// 为不同服务创建OpenAI客户端的工厂函数
function createClient(service: string): OpenAI {
    const baseURL = config.proxy[service] || urls[service];
    const apiKey = config.token[service];
    
    return new OpenAI({
        baseURL,
        apiKey,
        defaultHeaders: service === services.openrouter ? {
            'HTTP-Referer': 'https://fluent.thinkstu.com',
            'X-Title': 'FluentRead',
        } : undefined,
        dangerouslyAllowBrowser: true, // 浏览器环境
    });
}

// 获取模型名称
function getModelName(service: string): string {
    const customModelString = 'custom';
    let model = config.model[service] === customModelString 
        ? config.customModel[service] 
        : config.model[service];
    
    // 删除中文括号
    return model.replace(/（.*）/g, "");
}

// 获取temperature
function getTemperature(service: string, model: string): number {
    if (service === services.deepseek && model === 'deepseek-reasoner') {
        return undefined; // deepseek-reasoner不支持temperature
    }
    return service === services.deepseek ? 0.7 : 1.0;
}

// 构建messages
function buildMessages(origin: string, isBatch: boolean) {
    const system = config.system_role[config.service] || '你是一个专业的翻译助手';
    
    let user: string;
    if (isBatch) {
        user = `请将以下带序号的文本翻译成${config.to}。每个翻译项必须包含对应的序号(index)和译文(text)。

待翻译内容：
${origin}`;
    } else {
        user = `请将以下文本翻译成${config.to}：

${origin}`;
    }
    
    return [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user }
    ];
}

// 构建response_format
function buildResponseFormat(isBatch: boolean): OpenAI.ChatCompletionCreateParams['response_format'] {
    if (isBatch) {
        return {
            type: "json_schema" as const,
            json_schema: {
                name: "batch_translation",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        translations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    index: { type: "number" },
                                    text: { type: "string" }
                                },
                                required: ["index", "text"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["translations"],
                    additionalProperties: false
                }
            }
        };
    } else {
        return {
            type: "json_schema" as const,
            json_schema: {
                name: "single_translation",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        translation: { type: "string" }
                    },
                    required: ["translation"],
                    additionalProperties: false
                }
            }
        };
    }
}

/**
 * 统一翻译函数
 */
export async function unifiedTranslate(message: any): Promise<string> {
    try {
        const service = config.service;
        const isBatch = message.type === 'batch_translate';
        
        // 创建客户端
        const client = createClient(service);
        
        // 获取模型和参数
        const model = getModelName(service);
        const temperature = getTemperature(service, model);
        const messages = buildMessages(message.origin, isBatch);
        const responseFormat = buildResponseFormat(isBatch);
        
        // 调用API
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature,
            response_format: responseFormat,
        });
        
        // 提取结果
        const content = completion.choices[0]?.message?.content;
        const actualProvider = (completion as any).provider || service;
        
        if (!content) {
            console.error(`[unified] API返回的content为空 [Provider: ${actualProvider}]:`, completion);
            throw new Error(`[${actualProvider}] API返回的内容为空`);
        }
        
        // 在批量翻译时记录provider信息
        if (isBatch) {
            console.log(`[unified] 批量翻译成功 [Service: ${service}] [Provider: ${actualProvider}]`);
        }
        
        // 后处理（移除<think>标签等）
        return contentPostHandler(content);
        
    } catch (error) {
        // OpenAI SDK会自动处理错误格式
        if (error instanceof OpenAI.APIError) {
            const provider = (error as any).provider || config.service;
            console.error(`[unified] API错误 [Provider: ${provider}]:`, {
                status: error.status,
                message: error.message,
                type: error.type,
                code: error.code,
            });
            throw new Error(`[${provider}] ${error.message}`);
        }
        
        console.error('[unified] 翻译失败:', error);
        throw error;
    }
}
