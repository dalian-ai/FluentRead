/**
 * 统一的翻译服务 - 使用 Vercel AI SDK
 * 所有provider都通过这个统一接口调用
 */

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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

// 构建 prompt（语义约束，不重复结构）
function buildUserPrompt(origin: string, isBatch: boolean): string {
    if (isBatch) {
        // Schema 已经定义了结构，prompt 只说语义
        return `Translate the following numbered text to ${config.to}:\n\n${origin}`;
    } else {
        return `Translate to ${config.to}:\n\n${origin}`;
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
        
        // 创建 OpenAI provider（支持 Structured Outputs）
        const provider = createOpenAI({
            baseURL: baseURL,
            apiKey: apiKey,
        });
        
        // 构建 prompt（简洁，只定义语义）
        const systemPrompt = 'You are a professional translator.';
        const userPrompt = buildUserPrompt(message.origin, isBatch);
        const schema = buildSchema(isBatch);
        
        console.log(`[unified] Service: ${service}, Model: ${modelName}`);
        console.log(`[unified] Base URL: ${baseURL}`);
        console.log(`[unified] Batch mode: ${isBatch}`);
        console.log(`[unified] Prompt preview:`, userPrompt.substring(0, 200));
        
        // 使用 AI SDK 的 generateObject 和 schema（参考 Vercel AI SDK 示例）
        const result = await generateObject({
            model: provider(modelName),
            system: systemPrompt,
            prompt: userPrompt,
            schema: schema,
            temperature: temperature,
        });
        
        console.log(`[unified] 完整结果:`, result);
        console.log(`[unified] object:`, result.object);
        console.log(`[unified] usage:`, result.usage);
        console.log(`[unified] finishReason:`, result.finishReason);
        
        // 返回 JSON 字符串
        const resultJson = JSON.stringify(result.object);
        
        if (isBatch) {
            console.log(`[unified] 批量翻译成功 [Service: ${service}]`);
            console.log(`[unified] 结果前500字符:`, resultJson.substring(0, 500));
        }
        
        return resultJson;
        
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
