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
        const content = result.choices?.[0]?.message?.content;
        
        if (content === undefined || content === null) {
            console.error('[custom] API返回的content为null/undefined:', result);
            throw new Error('API返回的内容为空');
        }
        
        const contentStr = typeof content === 'string' ? content : String(content);
        return contentPostHandler(contentStr);
    } else {
        console.log("翻译失败：", resp);
        throw new Error(`翻译失败: ${resp.status} ${resp.statusText} body: ${await resp.text()}`);
    }
}

export default custom;