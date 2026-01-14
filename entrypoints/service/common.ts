import {method, urls} from "../utils/constant";
import {commonMsgTemplate} from "../utils/template";
import {config} from "@/entrypoints/utils/config";
import {contentPostHandler} from "@/entrypoints/utils/check";
import { services } from "../utils/option";

async function common(message: any) {
    try {
        const headers = new Headers({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token[config.service]}`
        });

        if(config.service === services.openrouter){
            headers.append('HTTP-Referer', 'https://fluent.thinkstu.com');
            headers.append('X-Title', 'FluentRead');
        }
                
        const url = config.proxy[config.service] || urls[config.service];
        
        // 检查是否为批量翻译请求
        const isBatch = message.type === 'batch_translate';

        const resp = await fetch(url, {
            method: method.POST,
            headers,
            body: commonMsgTemplate(message.origin, isBatch)
        });

        if (!resp.ok) {
            throw new Error(`翻译失败: ${resp.status} ${resp.statusText} body: ${await resp.text()}`);
        }

        const result = await resp.json();
        
        // 记录实际使用的provider（用于调试）
        const actualProvider = result.provider || config.service;
        
        // 检查是否有错误对象
        if (result.error) {
            const errorInfo = result.error;
            const provider = errorInfo.selectedProvider || actualProvider;
            const errorMsg = errorInfo.message || '未知错误';
            const errorType = errorInfo.type || 'unknown_error';
            const suggestion = errorInfo.suggestion || '';
            
            console.error(`[common] API返回错误 [Provider: ${provider}]:`, {
                message: errorMsg,
                type: errorType,
                suggestion: suggestion,
                fullError: result.error
            });
            
            throw new Error(`[${provider}] ${errorMsg}${suggestion ? ' - ' + suggestion : ''}`);
        }
        
        const content = result.choices?.[0]?.message?.content;
        
        if (content === undefined || content === null) {
            console.error(`[common] API返回的content为null/undefined [Provider: ${actualProvider}]:`, result);
            throw new Error(`[${actualProvider}] API返回的内容为空`);
        }
        
        // 在批量翻译时记录provider信息
        if (isBatch) {
            console.log(`[common] 批量翻译成功 [Provider: ${actualProvider}]`);
        }
        
        // 确保content是字符串
        const contentStr = typeof content === 'string' ? content : String(content);
        return contentPostHandler(contentStr);
    } catch (error) {
        console.error('API调用失败:', error);
        throw error;
    }
}

export default common;