/**
 * 统一的翻译服务 - 使用OpenAI兼容API
 * 所有provider都通过这个统一接口调用
 */

import OpenAI from 'openai';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';
import { services } from '../utils/option';
import { contentPostHandler } from '@/entrypoints/utils/check';

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
function getTemperature(service: string, model: string): number | undefined {
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
        // 对于支持 Structured Output 的服务，提示词需要明确要求 JSON
        const outputRequirement = '请严格按照JSON格式输出，不要包含任何Markdown标记或其他文本。';
            
        user = `请将以下带序号的文本翻译成${config.to}。${outputRequirement}

待翻译内容：
${origin}`;
    } else {
        const outputRequirement = '请严格按照JSON格式输出。';
        user = `请将以下文本翻译成${config.to}${outputRequirement ? '，' + outputRequirement : ''}：

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
        
        // 配置OpenAI客户端
        const baseURL = config.proxy[service] || urls[service];
        const apiKey = config.token[service];
        
        const client = new OpenAI({
            baseURL,
            apiKey,
            defaultHeaders: service === services.openrouter ? {
                'HTTP-Referer': 'https://fluent.thinkstu.com',
                'X-Title': 'FluentRead',
            } : undefined,
            dangerouslyAllowBrowser: true, // 浏览器环境
        });
        
        // 获取模型和参数
        const model = getModelName(service);
        const temperature = getTemperature(service, model);
        
        // 构建messages
        const messages = buildMessages(message.origin, isBatch);
        
        // 某些端点不支持 response_format，仅对支持的服务使用
        const supportsResponseFormat = true; // service !== services.custom;
        const responseFormat = supportsResponseFormat ? buildResponseFormat(isBatch) : undefined;
        
        // 使用 fetch 直接调用，绕过 Open SDK 可能的参数序列化问题
        // 这里的关键是确保 input 字段是一个数组，而不是由 SDK 错误地处理为对象
        const fetchUrl = `${baseURL.replace(/\/+$/, '')}/responses`;
        const payload = {
            model,
            input: messages, // 明确传递为数组
            messages,        // 冗余字段以防万一
            temperature,
            ...(responseFormat && { response_format: responseFormat }),
        };
        
        console.log(`[unified] 使用 fetch 调用: ${fetchUrl}`);
        // console.log(`[unified] Payload structure:`, JSON.stringify(payload).substring(0, 200) + '...');

        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...(service === services.openrouter ? {
                    'HTTP-Referer': 'https://fluent.thinkstu.com',
                    'X-Title': 'FluentRead',
                } : {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[unified] API请求失败: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`[${service}] API Error (${response.status}): ${errorText}`);
        }

        const completion = await response.json();
        
        // 提取结果 - 优先使用 output_parsed（结构化输出）
        let content: string;
        const actualProvider = (completion as any).provider || service;
        
        // 兼容不同的字段名：output_parsed, output, content, response
        if (completion.output_parsed) {
            // 使用结构化解析结果
            console.log(`[unified] 使用结构化输出 [Service: ${service}] [Provider: ${actualProvider}]`);
            content = JSON.stringify(completion.output_parsed);
        } else if (completion.output) {
            // 降级到文本输出 (output)
            console.log(`[unified] 使用文本输出(output) [Service: ${service}] [Provider: ${actualProvider}]`);
            content = typeof completion.output === 'string' ? completion.output : JSON.stringify(completion.output);
        } else if (completion.content) {
            // 降级到文本输出 (content) - 适配你的自定义返回格式
            console.log(`[unified] 使用文本输出(content) [Service: ${service}] [Provider: ${actualProvider}]`);
            content = typeof completion.content === 'string' ? completion.content : JSON.stringify(completion.content);
        } else if (completion.response) {
            // 降级到文本输出 (response)
            console.log(`[unified] 使用文本输出(response) [Service: ${service}] [Provider: ${actualProvider}]`);
            content = typeof completion.response === 'string' ? completion.response : JSON.stringify(completion.response);
        } else {
            console.error(`[unified] API返回的内容为空 [Provider: ${actualProvider}]:`, completion);
            throw new Error(`[${actualProvider}] API返回的内容为空: 缺少 output/content/response 字段`);
        }
        
        // 在批量翻译时记录provider信息
        if (isBatch) {
            console.log(`[unified] 批量翻译成功 [Service: ${service}] [Provider: ${actualProvider}]`);
            console.log(`[unified] 原始响应内容前500字符:`, content.substring(0, 500));
        }
        

        
        // 后处理（移除<think>标签等）
        return contentPostHandler(content);
        
    } catch (error) {
        const service = config.service;
        const baseURL = config.proxy[service] || urls[service];
        
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
        
        // 详细记录错误信息
        console.error(`[unified] 翻译失败 [Service: ${service}] [URL: ${baseURL}]`);
        console.error(`[unified] 错误类型: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.error(`[unified] 错误信息:`, error instanceof Error ? error.message : String(error));
        console.error(`[unified] 完整错误:`, error);
        
        // 构建有用的错误消息
        let errorMessage = `[${service}] Connection error`;
        
        if (error instanceof Error) {
            const errMsg = error.message.toLowerCase();
            
            // 检测常见的连接问题
            if (errMsg.includes('failed to fetch') || errMsg.includes('networkerror') || errMsg.includes('fetch')) {
                errorMessage = `[${service}] 无法连接到服务器 (${baseURL}). 请检查: 1) 服务是否运行 2) URL是否正确 3) 是否需要使用 http:// 而非 https://`;
            } else if (errMsg.includes('cors')) {
                errorMessage = `[${service}] CORS错误 (${baseURL}). 请检查服务器CORS配置`;
            } else if (errMsg.includes('timeout')) {
                errorMessage = `[${service}] 请求超时 (${baseURL}). 服务器响应太慢或无响应`;
            } else if (errMsg.includes('unauthorized') || errMsg.includes('401')) {
                errorMessage = `[${service}] 认证失败. 请检查API密钥是否正确`;
            } else {
                errorMessage = `[${service}] ${error.message}`;
            }
        }
        
        throw new Error(errorMessage);
    }
}
