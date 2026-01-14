import {commonMsgTemplate} from "../utils/template";
import {method} from "../utils/constant";
import {services} from "@/entrypoints/utils/option";
import {config} from "@/entrypoints/utils/config";
import {contentPostHandler} from "@/entrypoints/utils/check";

async function custom(message: any) {

    let headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', `Bearer ${config.token[services.custom]}`);

    const resp = await fetch(config.custom, {
        method: method.POST,
        headers: headers,
        body: commonMsgTemplate(message.origin)
    });

    if (resp.ok) {
        let result = await resp.json();
        
        // 记录实际使用的provider（用于调试）
        const actualProvider = result.provider || 'custom';
        const isBatch = message.type === 'batch_translate';
        
        // 检查是否有错误对象
        if (result.error) {
            const errorInfo = result.error;
            const provider = errorInfo.selectedProvider || actualProvider;
            const errorMsg = errorInfo.message || '未知错误';
            const errorType = errorInfo.type || 'unknown_error';
            const suggestion = errorInfo.suggestion || '';
            
            console.error(`[custom] API返回错误 [Provider: ${provider}]:`, {
                message: errorMsg,
                type: errorType,
                suggestion: suggestion,
                fullError: result.error
            });
            
            throw new Error(`[${provider}] ${errorMsg}${suggestion ? ' - ' + suggestion : ''}`);
        }
        
        const content = result.choices?.[0]?.message?.content;
        
        if (content === undefined || content === null) {
            console.error(`[custom] API返回的content为null/undefined [Provider: ${actualProvider}]:`, result);
            throw new Error(`[${actualProvider}] API返回的内容为空`);
        }
        
        // 在批量翻译时记录provider信息
        if (isBatch) {
            console.log(`[custom] 批量翻译成功 [Provider: ${actualProvider}]`);
        }
        
        const contentStr = typeof content === 'string' ? content : String(content);
        return contentPostHandler(contentStr);
    } else {
        console.log("翻译失败：", resp);
        throw new Error(`翻译失败: ${resp.status} ${resp.statusText} body: ${await resp.text()}`);
    }
}

export default custom;