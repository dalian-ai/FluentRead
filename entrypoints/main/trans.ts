import { checkConfig, searchClassName, skipNode } from "../utils/check";
import { cache } from "../utils/cache";
import { options, servicesType } from "../utils/option";
import { insertFailedTip, insertLoadingSpinner } from "../utils/icon";
import { styles } from "@/entrypoints/utils/constant";
import { beautyHTML, grabNode, grabAllNode, LLMStandardHTML, smashTruncationStyle } from "@/entrypoints/main/dom";
import { detectlang, throttle } from "@/entrypoints/utils/common";
import { getMainDomain, replaceCompatFn } from "@/entrypoints/main/compat";
import { config } from "@/entrypoints/utils/config";
import { translateText, cancelAllTranslations } from '@/entrypoints/utils/translateApi';

let hoverTimer: any; // 鼠标悬停计时器
let htmlSet = new Set(); // 防抖
export let originalContents = new Map(); // 保存原始内容
let isAutoTranslating = false; // 控制是否继续翻译新内容
let observer: IntersectionObserver | null = null; // 保存观察器实例
let mutationObserver: MutationObserver | null = null; // 保存 DOM 变化观察器实例

// 全文翻译的token限制
const MAX_TRANSLATION_TOKENS = 10000;

// 页面停留时间检测
let dwellTimer: any = null;
let hasDwellTranslated = false; // 防止重复触发
let firstBatchCompleted = false; // 第一批翻译是否完成
const DWELL_TIME_MS = 5000; // 停留5秒后触发批量翻译

/**
 * 启动页面停留时间检测
 * 只在用户主动翻译且第一批翻译完成后调用
 */
export function startDwellTimeDetection() {
    // 必须满足：第一批已完成 && 未执行过全量翻译 && 当前未在翻译全部内容
    if (!firstBatchCompleted || hasDwellTranslated) return;
    
    // 清除之前的计时器
    if (dwellTimer) {
        clearTimeout(dwellTimer);
    }
    
    console.log('[FluentRead] 第一批翻译已完成，开始监测用户停留时间...');
    
    dwellTimer = setTimeout(() => {
        if (!hasDwellTranslated) {
            console.log('[FluentRead] 用户停留足够时间，开始批量翻译全部内容');
            hasDwellTranslated = true;
            batchTranslateAllContent();
        }
    }, DWELL_TIME_MS);
}

/**
 * 停止页面停留时间检测
 */
export function stopDwellTimeDetection() {
    if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
    }
}

/**
 * 批量翻译所有内容（不受10000 token限制）
 * 只翻译尚未翻译的节点
 */
function batchTranslateAllContent() {
    // 获取所有需要翻译的节点
    const allNodes = grabAllNode(document.body);
    if (!allNodes.length) return;
    
    // 只获取尚未翻译的节点
    const untranslatedNodes = allNodes.filter(node => !node.hasAttribute(TRANSLATED_ATTR));
    
    if (!untranslatedNodes.length) {
        console.log('[FluentRead] 所有内容已翻译完成');
        return;
    }
    
    const totalText = untranslatedNodes.map(n => n.textContent || '').join(' ');
    const totalTokens = estimateTokens(totalText);
    console.log(`[FluentRead] 批量翻译剩余内容：${untranslatedNodes.length}个节点，估计约${totalTokens} tokens`);
    
    // 翻译剩余的所有节点
    let translatedCount = 0;
    untranslatedNodes.forEach((node, index) => {
        // 去重
        if (node.hasAttribute(TRANSLATED_ATTR)) return;
        
        // 为节点分配唯一ID
        const nodeId = `fr-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
        
        // 保存原始内容
        originalContents.set(nodeId, node.innerHTML);
        
        // 标记为已翻译
        node.setAttribute(TRANSLATED_ATTR, 'true');
        
        // 分批处理，每50个节点为一批，批次间延迟100ms
        const batchDelay = Math.floor(index / 50) * 100;
        
        setTimeout(() => {
            if (config.display === styles.bilingualTranslation) {
                handleBilingualTranslation(node, false);
            } else {
                handleSingleTranslation(node, false);
            }
        }, batchDelay);
        
        translatedCount++;
    });
    
    console.log(`[FluentRead] 批量翻译：已启动${translatedCount}个剩余节点的翻译任务`);
}

/**
 * 粗略估算文本的token数量
 * 中文字符：约2 tokens/字
 * 英文单词：约1.3 tokens/词
 */
function estimateTokens(text: string): number {
    // 统计中文字符数量
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文单词数量（简化估算）
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    // 其他字符按0.5 token计算
    const otherChars = text.length - chineseChars - englishWords;
    
    return Math.ceil(chineseChars * 2 + englishWords * 1.3 + otherChars * 0.5);
}

/**
 * 根据token限制截断节点数组
 * @param nodes 所有节点
 * @param maxTokens 最大token数
 * @returns 截断后的节点数组
 */
function truncateNodesByTokens(nodes: Element[], maxTokens: number): Element[] {
    const result: Element[] = [];
    let totalTokens = 0;
    
    for (const node of nodes) {
        const nodeText = node.textContent || '';
        const nodeTokens = estimateTokens(nodeText);
        
        // 如果加入当前节点会超过限制，则停止
        if (totalTokens + nodeTokens > maxTokens) {
            console.log(`[FluentRead] 达到token限制: ${totalTokens}/${maxTokens}，已处理${result.length}/${nodes.length}个节点`);
            break;
        }
        
        result.push(node);
        totalTokens += nodeTokens;
    }
    
    return result;
}

// 使用自定义属性标记已翻译的节点
const TRANSLATED_ATTR = 'data-fr-translated';
const TRANSLATED_ID_ATTR = 'data-fr-node-id'; // 添加节点ID属性

let nodeIdCounter = 0; // 节点ID计数器

// 恢复原文内容
export function restoreOriginalContent() {
    // 取消所有等待中的翻译任务
    cancelAllTranslations();
    
    // 1. 遍历所有已翻译的节点
    document.querySelectorAll(`[${TRANSLATED_ATTR}="true"]`).forEach(node => {
        const nodeId = node.getAttribute(TRANSLATED_ID_ATTR);
        if (nodeId && originalContents.has(nodeId)) {
            const originalContent = originalContents.get(nodeId);
            node.innerHTML = originalContent;
            node.removeAttribute(TRANSLATED_ATTR);
            node.removeAttribute(TRANSLATED_ID_ATTR);
            
            // 移除可能添加的翻译相关类
            node.classList.remove('fluent-read-bilingual');
        }
    });
    
    // 2. 移除所有翻译内容元素
    document.querySelectorAll('.fluent-read-bilingual-content').forEach(element => {
        element.remove();
    });
    
    // 3. 移除所有翻译过程中添加的加载动画和错误提示
    document.querySelectorAll('.fluent-read-loading, .fluent-read-retry-wrapper').forEach(element => {
        element.remove();
    });
    
    // 4. 清空存储的原始内容
    originalContents.clear();
    
    // 5. 停止所有观察器
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    // 6. 重置所有翻译相关的状态
    isAutoTranslating = false;
    hasDwellTranslated = false; // 重置停留翻译标记
    firstBatchCompleted = false; // 重置第一批完成标记
    stopDwellTimeDetection(); // 停止停留检测
    htmlSet.clear(); // 清空防抖集合
    nodeIdCounter = 0; // 重置节点ID计数器
    
    // 7. 消除可能存在的全局样式污染
    const tempStyleElements = document.querySelectorAll('style[data-fr-temp-style]');
    tempStyleElements.forEach(el => el.remove());
}

// 自动翻译整个页面的功能
export function autoTranslateEnglishPage() {
    // 如果已经在翻译中，则返回
    if (isAutoTranslating) return;
    
    // 获取当前页面的语言（暂时注释，存在识别问题）
    // const text = document.documentElement.innerText || '';
    // const cleanText = text.replace(/[\s\u3000]+/g, ' ').trim().slice(0, 500);
    // const language = detectlang(cleanText);
    // console.log('当前页面语言：', language);
    // const to = config.to;
    // if (to.includes(language)) {
    //     console.log('目标语言与当前页面语言相同，不进行翻译');
    //     return;
    // }
    // console.log('当前页面非目标语言，开始翻译');

    // 获取所有需要翻译的节点（尝试获取全文，而非仅viewport）
    let allNodes = grabAllNode(document.body);
    if (!allNodes.length) return;

    // 估算总token数
    const totalText = allNodes.map(n => n.textContent || '').join(' ');
    const totalTokens = estimateTokens(totalText);
    console.log(`[FluentRead] 全文共${allNodes.length}个节点，估计约${totalTokens} tokens`);

    // 如果超过10000 tokens，则截断
    let nodes = allNodes;
    if (totalTokens > MAX_TRANSLATION_TOKENS) {
        console.log(`[FluentRead] 全文超过${MAX_TRANSLATION_TOKENS} tokens限制，将只翻译前${MAX_TRANSLATION_TOKENS} tokens`);
        nodes = truncateNodesByTokens(allNodes, MAX_TRANSLATION_TOKENS);
    } else {
        console.log(`[FluentRead] 全文未超过限制，将翻译全部内容`);
    }

    isAutoTranslating = true;
    firstBatchCompleted = false; // 重置第一批完成标记

    // 立即翻译所有选定的节点（前10000 tokens），而不是等待它们进入viewport
    let translatedCount = 0;
    const totalNodesToTranslate = nodes.length;
    
    nodes.forEach((node, index) => {
        // 去重
        if (node.hasAttribute(TRANSLATED_ATTR)) return;
        
        // 为节点分配唯一ID
        const nodeId = `fr-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
        
        // 保存原始内容
        originalContents.set(nodeId, node.innerHTML);
        
        // 标记为已翻译
        node.setAttribute(TRANSLATED_ATTR, 'true');

        // 添加小延迟，避免一次性发起过多请求，按批次翻译
        // 每50个节点为一批，批次间延迟100ms
        const batchDelay = Math.floor(index / 50) * 100;
        
        setTimeout(() => {
            if (config.display === styles.bilingualTranslation) {
                handleBilingualTranslation(node, false);
            } else {
                handleSingleTranslation(node, false);
            }
            
            // 检查是否是最后一个节点，如果是则标记第一批翻译完成
            if (index === totalNodesToTranslate - 1) {
                // 延迟一点时间确保最后的翻译请求已发出
                setTimeout(() => {
                    firstBatchCompleted = true;
                    console.log('[FluentRead] 第一批翻译任务已全部启动');
                    startDwellTimeDetection(); // 启动停留检测
                }, 500);
            }
        }, batchDelay);
        
        translatedCount++;
    });
    
    console.log(`[FluentRead] 已启动${translatedCount}个节点的翻译任务`);

    // 创建 MutationObserver 监听 DOM 变化
    mutationObserver = new MutationObserver((mutations) => {
        if (!isAutoTranslating) return;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // 元素节点
                    // 只处理未翻译的新节点
                    const newNodes = grabAllNode(node as Element).filter(
                        n => !n.hasAttribute(TRANSLATED_ATTR)
                    );
                    newNodes.forEach(n => observer?.observe(n));
                }
            });
        });
    });

    // 监听整个 body 的变化
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 处理鼠标悬停翻译的主函数
export function handleTranslation(mouseX: number, mouseY: number, delayTime: number = 0) {
    // 检查配置
    if (!checkConfig()) return;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {

        let node = grabNode(document.elementFromPoint(mouseX, mouseY));

        // 判断是否跳过节点
        if (skipNode(node)) return;

        // 防抖
        let nodeOuterHTML = node.outerHTML;
        if (htmlSet.has(nodeOuterHTML)) return;
        htmlSet.add(nodeOuterHTML);

        // 根据翻译模式进行翻译
        if (config.display === styles.bilingualTranslation) {
            handleBilingualTranslation(node, delayTime > 0);  // 根据 delayTime 可判断是否为滑动翻译
        } else {
            handleSingleTranslation(node, delayTime > 0);
        }
    }, delayTime);
}

// 双语翻译
export function handleBilingualTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    // 如果已经翻译过，250ms 后删除翻译结果
    let bilingualNode = searchClassName(node, 'fluent-read-bilingual');
    if (bilingualNode) {
        if (slide) {
            htmlSet.delete(nodeOuterHTML);
            return;
        }
        let spinner = insertLoadingSpinner(bilingualNode as HTMLElement, true);
        setTimeout(() => {
            spinner.remove();
            const content = searchClassName(bilingualNode as HTMLElement, 'fluent-read-bilingual-content');
            if (content && content instanceof HTMLElement) content.remove();
            (bilingualNode as HTMLElement).classList.remove('fluent-read-bilingual');
            htmlSet.delete(nodeOuterHTML);
        }, 250);
        return;
    }

    // 检查是否有缓存
    let cached = cache.localGet(node.textContent);
    if (cached) {
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, cached);
        }, 250);
        return;
    }

    // 翻译
    bilingualTranslate(node, nodeOuterHTML);
}

// 单语翻译
export function handleSingleTranslation(node: any, slide: boolean) {
    let nodeOuterHTML = node.outerHTML;
    let outerHTMLCache = cache.localGet(node.outerHTML);


    if (outerHTMLCache) {
        // handleTranslation 已处理防抖 故删除判断 原bug 在保存完成后 刷新页面 可以取得缓存 直接return并没有翻译
        let spinner = insertLoadingSpinner(node, true);
        setTimeout(() => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);

            // 兼容部分网站独特的 DOM 结构
            let fn = replaceCompatFn[getMainDomain(document.location.hostname)];
            if (fn) fn(node, outerHTMLCache);
            else node.outerHTML = outerHTMLCache;

        }, 250);
        return;
    }

    singleTranslate(node);
}


function bilingualTranslate(node: any, nodeOuterHTML: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    let origin = node.textContent;
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);
            bilingualAppendChild(node, text);
        })
        .catch((error: Error) => {
            spinner.remove();
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}


export function singleTranslate(node: any) {
    if (detectlang(node.textContent.replace(/[\s\u3000]/g, '')) === config.to) return;

    let origin = servicesType.isMachine(config.service) ? node.innerHTML : LLMStandardHTML(node);
    let spinner = insertLoadingSpinner(node);
    
    // 使用队列管理的翻译API
    translateText(origin, document.title)
        .then((text: string) => {
            spinner.remove();
            
            text = beautyHTML(text);
            
            if (!text || origin === text) return;
            
            let oldOuterHtml = node.outerHTML;
            node.innerHTML = text;
            let newOuterHtml = node.outerHTML;
            
            // 缓存翻译结果
            cache.localSetDual(oldOuterHtml, newOuterHtml);
            cache.set(htmlSet, newOuterHtml, 250);
            htmlSet.delete(oldOuterHtml);
        })
        .catch((error: Error) => {
            spinner.remove();
            insertFailedTip(node, error.toString() || "翻译失败", spinner);
        });
}

export const handleBtnTranslation = throttle((node: any) => {
    let origin = node.innerText;
    let rs = cache.localGet(origin);
    if (rs) {
        node.innerText = rs;
        return;
    }

    config.count++ && storage.setItem('local:config', JSON.stringify(config));

    browser.runtime.sendMessage({ context: document.title, origin: origin })
        .then((text: string) => {
            cache.localSetDual(origin, text);
            node.innerText = text;
        }).catch((error: any) => console.error('调用失败:', error))
}, 250)


function bilingualAppendChild(node: any, text: string) {
    node.classList.add("fluent-read-bilingual");
    let newNode = document.createElement("span");
    newNode.classList.add("fluent-read-bilingual-content");
    // find the style
    const style = options.styles.find(s => s.value === config.style && !s.disabled);
    if (style?.class) {
        newNode.classList.add(style.class);
    }
    newNode.append(text);
    smashTruncationStyle(node);
    node.appendChild(newNode);
}