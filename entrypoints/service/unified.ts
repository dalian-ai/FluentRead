/**
 * 统一的翻译服务 - 使用OpenAI兼容API
 * 所有provider都通过这个统一接口调用
 */

import OpenAI from 'openai';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';
import { services } from '../utils/option';
import { contentPostHandler } from '@/entrypoints/utils/check';

/**
 * 将文本格式的批量翻译结果转换为 JSON 格式
 * 输入格式: [1] 译文1\n\n[2] 译文2\n\n...
 * 输出格式: {"translations": [{"index": 1, "text": "译文1"}, ...]}
 */
function convertTextToJsonFormat(text: string): string {
    try {
        console.log('[unified] 开始转换文本格式，原始内容前500字符:', text.substring(0, 500));
        
        // 先按行分割，然后逐行处理
        const lines = text.split('\n');
        const translations: Array<{index: number, text: string}> = [];
        let currentIndex = -1;
        let currentText = '';
        
        for (const line of lines) {
            // 匹配 [数字] 开头的行
            const indexMatch = line.match(/^\[(\d+)\]\s*(.*)$/);
            
            if (indexMatch) {
                // 如果之前有内容，先保存
                if (currentIndex > 0 && currentText.trim()) {
                    translations.push({
                        index: currentIndex,
                        text: currentText.trim()
                    });
                }
                
                // 开始新的条目
                currentIndex = parseInt(indexMatch[1]);
                currentText = indexMatch[2]; // 可能为空，也可能有内容
            } else if (currentIndex > 0) {
                // 继续追加到当前条目（多行内容）
                if (line.trim()) {
                    currentText += (currentText ? '\n' : '') + line;
                }
            }
        }
        
        // 保存最后一条
        if (currentIndex > 0 && currentText.trim()) {
            translations.push({
                index: currentIndex,
                text: currentText.trim()
            });
        }
        
        if (translations.length === 0) {
            console.warn('[unified] 无法解析文本格式的批量翻译结果，返回原文');
            console.warn('[unified] 原始内容:', text);
            return text;
        }
        
        const result = JSON.stringify({ translations });
        console.log(`[unified] 成功转换 ${translations.length} 条文本格式翻译为 JSON`);
        console.log('[unified] 转换后的前3条:');
        translations.slice(0, 3).forEach((item, idx) => {
            console.log(`  [${item.index}] 长度: ${item.text.length}, 内容: ${item.text.substring(0, 150)}...`);
        });
        return result;
    } catch (error) {
        console.error('[unified] 文本转JSON失败:', error);
        return text;
    }
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
        
        // 构建输入文本
        const system = config.system_role[config.service] || '你是一个专业的翻译助手';
        let input: string;
        if (isBatch) {
            input = `${system}\n\n请将以下带序号的文本翻译成${config.to}。每个翻译项必须包含对应的序号(index)和译文(text)。\n\n待翻译内容：\n${message.origin}`;
        } else {
            input = `${system}\n\n请将以下文本翻译成${config.to}：\n\n${message.origin}`;
        }
        
        // 某些端点不支持 response_format，仅对支持的服务使用
        const supportsResponseFormat = service !== services.custom;
        const responseFormat = supportsResponseFormat ? buildResponseFormat(isBatch) : undefined;
        
        // 调用 Responses API
        const completion = await (client as any).responses.create({
            model,
            input,
            temperature,
            ...(responseFormat && { response_format: responseFormat }),
        });
        
        // 提取结果 - 优先使用 output_parsed（结构化输出）
        let content: string;
        const actualProvider = (completion as any).provider || service;
        
        if (completion.output_parsed) {
            // 使用结构化解析结果
            console.log(`[unified] 使用结构化输出 [Service: ${service}] [Provider: ${actualProvider}]`);
            content = JSON.stringify(completion.output_parsed);
        } else if (completion.output) {
            // 降级到文本输出
            console.log(`[unified] 使用文本输出 [Service: ${service}] [Provider: ${actualProvider}]`);
            content = typeof completion.output === 'string' ? completion.output : JSON.stringify(completion.output);
        } else {
            console.error(`[unified] API返回的内容为空 [Provider: ${actualProvider}]:`, completion);
            throw new Error(`[${actualProvider}] API返回的内容为空`);
        }
        
        // 在批量翻译时记录provider信息
        if (isBatch) {
            console.log(`[unified] 批量翻译成功 [Service: ${service}] [Provider: ${actualProvider}]`);
            console.log(`[unified] 原始响应内容前500字符:`, content.substring(0, 500));
        }
        
        // 对于不支持 response_format 的服务，需要手动转换格式
        if (isBatch && service === services.custom && !completion.output_parsed) {
            return convertTextToJsonFormat(content);
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
