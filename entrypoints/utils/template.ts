// 消息模板工具
import {customModelString, defaultOption} from "./option";
import {config} from "@/entrypoints/utils/config";

/**
 * 构建翻译提示词
 */
function buildTranslationPrompt(origin: string, targetLang: string, isBatch: boolean): string {
    if (isBatch) {
        return `请将以下带序号的文本翻译成${targetLang}。每个翻译项必须包含对应的序号(index)和译文(text)。

待翻译内容：
${origin}`;
    } else {
        return `请将以下文本翻译成${targetLang}：

${origin}`;
    }
}

/**
 * 获取清理后的模型名称
 */
function getCleanModelName(): string {
    let model = config.model[config.service] === customModelString 
        ? config.customModel[config.service] 
        : config.model[config.service];
    
    // 删除模型名称中的中文括号及其内容，如"gpt-4（推荐）" -> "gpt-4"
    return model.replace(/（.*）/g, "");
}

// openai 格式的消息模板（通用模板）
export function commonMsgTemplate(origin: string, isBatch: boolean = false) {
    const model = getCleanModelName();
    const system = config.system_role[config.service] || defaultOption.system_role;
    const user = buildTranslationPrompt(origin, config.to, isBatch);

    const payload: Record<string, any> = {
        model,
        temperature: 1.0,
        messages: [
            {role: 'system', content: system},
            {role: 'user', content: user},
        ]
    };
    
    // 使用 json_schema 强制返回正确格式
    if (isBatch) {
        payload.response_format = {
            type: "json_schema",
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
        payload.response_format = {
            type: "json_schema",
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
    
    return JSON.stringify(payload);
}

// deepseek
export function deepseekMsgTemplate(origin: string, isBatch: boolean = false) {
    const model = getCleanModelName();
    const system = config.system_role[config.service] || defaultOption.system_role;
    const user = buildTranslationPrompt(origin, config.to, isBatch);

    const payload: Record<string, any> = {
        model,
        messages: [
            {role: 'system', content: system},
            {role: 'user', content: user},
        ]
    };

    // 如果不是 deepseek-reasoner 模型,则添加 temperature
    if (model !== 'deepseek-reasoner') {
        payload.temperature = 0.7;
    }
    
    // 使用 json_schema 强制返回正确格式
    if (isBatch) {
        payload.response_format = {
            type: "json_schema",
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
        payload.response_format = {
            type: "json_schema",
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

    return JSON.stringify(payload);
}
