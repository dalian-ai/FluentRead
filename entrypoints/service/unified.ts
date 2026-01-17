/**
 * 统一的翻译服务 - 使用 Vercel AI SDK
 * 所有provider都通过这个统一接口调用
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { config } from '@/entrypoints/utils/config';
import { urls } from '../utils/constant';
import { services } from '../utils/option';

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

// 构建 prompt（只包含用户消息）
function buildUserPrompt(origin: string, isBatch: boolean): string {
    if (isBatch) {
        return `请将以下带序号的文本翻译成${config.to}。

待翻译内容：
${origin}`;
    } else {
        return `请将以下文本翻译成${config.to}：

${origin}`;
    }
}

// 构建 Zod Schema
function buildSchema(isBatch: boolean) {
    if (isBatch) {
        return z.object({
            translations: z.array(
                z.object({
                    index: z.number(),
                    text: z.string()
                })
            )
        });
    } else {
        return z.object({
            translation: z.string()
        });
    }
}

/**
 * 统一翻译函数
 */
export async function unifiedTranslate(message: any): Promise<string> {
    try {
        const service = config.service;
        const isBatch = message.type === 'batch_translate';
        
        // 配置
        const baseURL = config.proxy[service] || urls[service];
        const apiKey = config.token[service];
        
        // 获取模型和参数
        const modelName = getModelName(service);
        const temperature = getTemperature(service, modelName);
        
        // 构建 provider/model 格式
        // 对于 custom service，直接使用 baseURL
        let modelString: string;
        if (service === services.custom) {
            // 自定义服务需要特殊处理
            modelString = `custom/${modelName}`;
        } else {
            modelString = `${service}/${modelName}`;
        }
        
        // 构建 system 和 user prompt
        const systemPrompt = config.system_role[config.service] || 'You are a professional translation assistant';
        const userPrompt = buildUserPrompt(message.origin, isBatch);
        const schema = buildSchema(isBatch);
        
        console.log(`[unified] 使用 AI SDK 调用模型: ${modelString}`);
        
        // 使用 AI SDK 的 generateText 和 structured output
        const { output } = await generateText({
            model: modelString,
            system: systemPrompt,
            prompt: userPrompt,
            output: Output.object({
                schema: schema
            }),
            temperature: temperature,
            // 传递自定义配置
            ...(service === services.custom && {
                experimental_providerConfig: {
                    baseURL,
                    apiKey,
                }
            }),
            ...(service !== services.custom && {
                apiKey: apiKey,
            })
        });
        
        // 返回 JSON 字符串
        const result = JSON.stringify(output);
        
        if (isBatch) {
            console.log(`[unified] 批量翻译成功 [Service: ${service}]`);
            console.log(`[unified] 结果前500字符:`, result.substring(0, 500));
        }
        
        return result;
        
    } catch (error) {
        const service = config.service;
        const baseURL = config.proxy[service] || urls[service];
        
        // 详细记录错误信息
        console.error(`[unified] 翻译失败 [Service: ${service}] [URL: ${baseURL}]`);
        console.error(`[unified] 错误类型: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.error(`[unified] 错误信息:`, error instanceof Error ? error.message : String(error));
        console.error(`[unified] 完整错误:`, error);
        
        throw error;
    }
}
