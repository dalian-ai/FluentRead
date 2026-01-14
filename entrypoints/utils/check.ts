import { customModelString, services, servicesType } from "./option";
import { sendErrorMessage } from "./tip";
import { config } from "@/entrypoints/utils/config";

// Check configuration before translation
export function checkConfig(): boolean {
    // 1. Check if the plugin is enabled
    if (!config.on) return false;

    // 2. Check if the token is provided for services that require it
    if (servicesType.isUseToken(config.service) && !config.token[config.service]) {
        sendErrorMessage("令牌尚未配置，请前往设置页配置");
        return false;
    }

    // 3. Check if a model is selected for AI services
    if (servicesType.isAI(config.service)) {
        const model = config.model[config.service];
        const customModel = config.customModel[config.service];
        if (!model || (model === customModelString && !customModel)) {
            sendErrorMessage("模型尚未配置，请前往设置页配置");
            return false;
        }
    }

    return true;
}

// Check if the node needs to be translated
export function skipNode(node: Node): boolean {
    return !node || !node.textContent?.trim() || hasLoadingSpinner(node) || hasRetryTag(node);
}

// Check if the node or any of its children contains a loading spinner
export function hasLoadingSpinner(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;

    // Type guard to check if the node is an Element
    if (node instanceof Element && node.classList.contains('fluent-read-loading')) return true;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasLoadingSpinner(child));
    }

    return false;
}

// Check if the node or any of its children contains a retry tag
export function hasRetryTag(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return false;

    // Type guard to check if the node is an Element
    if (node instanceof Element && node.classList.contains('fluent-read-failure')) return true;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        return Array.from(node.children).some(child => hasRetryTag(child));
    }

    return false;
}

// Search for a node with a specific class name
export function searchClassName(node: Node, className: string): Node | null {
    if (node instanceof Element && node.classList.contains(className)) return node;

    // Check children only if the node is an Element
    if (node instanceof Element) {
        for (let child of node.children) {
            let result = searchClassName(child, className);
            if (result) return result;
        }
    }

    return null;
}

export function contentPostHandler(text: string) {
    // 1. 替换掉<think>与</think>之间的内容（支持多个think标签）
    let content = text;
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "");
    
    // 2. 移除可能的翻译说明等额外内容（括号内的说明）
    // 仅在批量翻译时这样做，单个翻译保留说明
    // 但为了保险，只移除末尾的大段括号说明
    content = content.replace(/\n*[（(]\s*翻译说明[\s\S]*?[）)]\s*$/g, "");
    
    // 3. 清理前后空白
    content = content.trim();
    
    return content;
}