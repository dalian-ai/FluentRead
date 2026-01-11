// 消息模板工具
import {customModelString, defaultOption} from "./option";
import {config} from "@/entrypoints/utils/config";

// openai 格式的消息模板（通用模板）
export function commonMsgTemplate(origin: string, isBatch: boolean = false) {
    // 检测是否使用自定义模型
    let model = config.model[config.service] === customModelString ? config.customModel[config.service] : config.model[config.service]

    // 删除模型名称中的中文括号及其内容，如"gpt-4（推荐）" -> "gpt-4"
    model = model.replace(/（.*）/g, "");

    let system = config.system_role[config.service] || defaultOption.system_role;
    let user: string;
    
    if (isBatch) {
        // 批量翻译模式：提示词需要告诉AI保持序号格式
        user = `请将以下多段文本翻译成${config.to}。每段文本前有序号标记 [数字]，请在翻译结果中保持相同的序号格式。

${origin}

要求：
1. 保持每段的序号格式 [1], [2], [3]...
2. 每段翻译结果之间用两个换行符分隔
3. 只返回翻译结果，不要添加其他说明`;
    } else {
        // 单独翻译模式：使用原有的用户提示词
        user = (config.user_role[config.service] || defaultOption.user_role)
            .replace('{{to}}', config.to).replace('{{origin}}', origin);
    }

    return JSON.stringify({
        'model': model,
        "temperature": 1.0,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ]
    })
}

// deepseek
export function deepseekMsgTemplate(origin: string, isBatch: boolean = false) {
    // 检测是否使用自定义模型
    let model = config.model[config.service] === customModelString ? config.customModel[config.service] : config.model[config.service]

    // 删除模型名称中的中文括号及其内容，如"gpt-4（推荐）" -> "gpt-4"
    model = model.replace(/（.*）/g, "");

    let system = config.system_role[config.service] || defaultOption.system_role;
    let user: string;
    
    if (isBatch) {
        // 批量翻译模式
        user = `请将以下多段文本翻译成${config.to}。每段文本前有序号标记 [数字]，请在翻译结果中保持相同的序号格式。

${origin}

要求：
1. 保持每段的序号格式 [1], [2], [3]...
2. 每段翻译结果之间用两个换行符分隔
3. 只返回翻译结果，不要添加其他说明`;
    } else {
        // 单独翻译模式
        user = (config.user_role[config.service] || defaultOption.user_role)
            .replace('{{to}}', config.to).replace('{{origin}}', origin);
    }

    const payload: any = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ]
    };

    // 如果不是 deepseek-reasoner 模型,则添加 temperature
    if (model !== 'deepseek-reasoner') {
        payload.temperature = 0.7;
    }

    return JSON.stringify(payload);
}
