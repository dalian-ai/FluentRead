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
import { batchTranslateTexts } from '@/entrypoints/utils/batchTranslate';

let hoverTimer: any; // 鼠标悬停计时器
let htmlSet = new Set(); // 防抖
export let originalContents = new Map(); // 保存原始内容
let isAutoTranslating = false; // 控制是否继续翻译新内容
let observer: IntersectionObserver | null = null; // 保存观察器实例
let mutationObserver: MutationObserver | null = null; // 保存 DOM 变化观察器实例

// 全文翻译的token限制（与后台API限制保持一致）
const MAX_TRANSLATION_TOKENS = 7000;

// 页面停留时间检测
let dwellTimer: any = null;
let hasDwellTranslated = false; // 防止重复触发
let firstBatchCompleted = false; // 第一批翻译是否完成
let rescanTimer: any = null; // 定期重新扫描计时器
const DWELL_TIME_MS = 5000; // 停留5秒后触发批量翻译
const RESCAN_INTERVAL_MS = 3000; // 每3秒重新扫描一次

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
 * 启动定期重新扫描，以捕获延迟加载的内容
 */
function startRescan() {
    // 如果已经在扫描，先停止
    if (rescanTimer) {
        clearInterval(rescanTimer);
    }
    
    let rescanCount = 0;
    const maxRescans = 10; // 最多重新扫描10次（30秒）
    
    console.log('[FluentRead] 启动定期重新扫描以捕获延迟加载内容');
    
    rescanTimer = setInterval(() => {
        rescanCount++;
        console.log(`[FluentRead] 第${rescanCount}次重新扫描...`);
        
        // 使用两种方法重新扫描
        const nodesOld = grabAllNode(document.body);
        const nodesNew = grabAllTextElements(document.body);
        const allNodesSet = new Set([...nodesOld, ...nodesNew]);
        const allNodes = Array.from(allNodesSet);
        
        const untranslatedNodes = allNodes.filter(node => {
            if (node.hasAttribute(TRANSLATED_ATTR)) return false;
            
            // 检查祖先是否已翻译
            let ancestor = node.parentElement;
            while (ancestor) {
                if (ancestor.hasAttribute(TRANSLATED_ATTR)) {
                    return false;
                }
                ancestor = ancestor.parentElement;
            }
            return true;
        });
        
        if (untranslatedNodes.length > 0) {
            console.log(`[FluentRead] 发现${untranslatedNodes.length}个新节点，开始翻译`);
            
            untranslatedNodes.forEach((node, index) => {
                const nodeId = `fr-node-${nodeIdCounter++}`;
                node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
                originalContents.set(nodeId, node.innerHTML);
                node.setAttribute(TRANSLATED_ATTR, 'true');
                
                const batchDelay = Math.floor(index / 100) * 20;
                setTimeout(() => {
                    if (config.display === styles.bilingualTranslation) {
                        handleBilingualTranslation(node, false);
                    } else {
                        handleSingleTranslation(node, false);
                    }
                }, batchDelay);
            });
        } else {
            console.log(`[FluentRead] 未发现新节点`);
        }
        
        // 达到最大扫描次数后停止
        if (rescanCount >= maxRescans) {
            console.log('[FluentRead] 达到最大重新扫描次数，停止扫描');
            clearInterval(rescanTimer);
            rescanTimer = null;
        }
    }, RESCAN_INTERVAL_MS);
}

/**
 * 停止定期重新扫描
 */
function stopRescan() {
    if (rescanTimer) {
        clearInterval(rescanTimer);
        rescanTimer = null;
    }
}

/**
 * 更激进地获取所有包含文本的元素
 * 用于批量翻译时确保不遗漏内容
 */
function grabAllTextElements(root: Node): Element[] {
    if (!root || !(root instanceof Element)) return [];
    
    const result: Element[] = [];
    const skipTags = new Set(['script', 'style', 'noscript', 'iframe', 'code', 'pre', 'svg']);
    
    // 递归遍历所有元素
    function traverse(element: Element) {
        const tag = element.tagName?.toLowerCase();
        
        // 跳过不需要翻译的标签
        if (skipTags.has(tag)) return;
        if (element.classList?.contains('notranslate')) return;
        if (element.classList?.contains('sr-only')) return;
        
        // 检查是否有直接的文本内容（不包括子元素的文本）
        let hasDirectText = false;
        for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
                hasDirectText = true;
                break;
            }
        }
        
        // 如果有直接文本，尝试获取翻译节点
        if (hasDirectText) {
            const node = grabNode(element);
            if (node && !result.includes(node)) {
                result.push(node);
            }
        }
        
        // 继续遍历子元素
        for (const child of element.children) {
            traverse(child);
        }
    }
    
    traverse(root as Element);
    return result;
}

/**
 * 批量翻译所有内容（不受10000 token限制）
 * 只翻译尚未翻译的节点
 */
function batchTranslateAllContent() {
    // 先尝试用原来的方法获取节点
    const allNodesOld = grabAllNode(document.body);
    console.log(`[FluentRead] grabAllNode 扫描到 ${allNodesOld.length} 个节点`);
    
    // 同时用更激进的方法获取所有可能的文本节点
    const allNodesNew = grabAllTextElements(document.body);
    console.log(`[FluentRead] grabAllTextElements 扫描到 ${allNodesNew.length} 个节点`);
    
    // 合并两个结果并去重
    const allNodesSet = new Set([...allNodesOld, ...allNodesNew]);
    const allNodes = Array.from(allNodesSet);
    console.log(`[FluentRead] 合并去重后共 ${allNodes.length} 个节点`);
    
    if (!allNodes.length) return;
    
    // 只获取尚未翻译的节点
    const untranslatedNodes = allNodes.filter(node => !node.hasAttribute(TRANSLATED_ATTR));
    
    // 进一步过滤掉祖先已翻译的节点
    const nodesToTranslate = untranslatedNodes.filter(node => {
        let ancestor = node.parentElement;
        while (ancestor) {
            if (ancestor.hasAttribute(TRANSLATED_ATTR)) {
                return false;
            }
            ancestor = ancestor.parentElement;
        }
        return true;
    });
    
    console.log(`[FluentRead] 未翻译节点: ${untranslatedNodes.length}, 过滤祖先后: ${nodesToTranslate.length}`);
    
    if (!nodesToTranslate.length) {
        console.log('[FluentRead] 所有内容已翻译完成');
        // 启动定期重新扫描，以捕获延迟加载的内容
        startRescan();
        return;
    }
    
    const totalText = nodesToTranslate.map(n => n.textContent || '').join(' ');
    const totalTokens = estimateTokens(totalText);
    console.log(`[FluentRead] 批量翻译剩余内容：${nodesToTranslate.length}个节点，估计约${totalTokens} tokens`);
    
    // 准备所有节点数据
    const nodeDataList = nodesToTranslate.map(node => {
        // 为节点分配唯一ID
        const nodeId = `fr-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
        
        // 保存原始内容
        originalContents.set(nodeId, node.innerHTML);
        
        // 标记为已翻译（防止重复翻译）
        node.setAttribute(TRANSLATED_ATTR, 'true');
        
        return {
            node,
            nodeId,
            text: node.textContent || ''
        };
    });
    
    // 收集所有文本
    const textsToTranslate = nodeDataList.map(data => data.text);
    
    // 直接批量翻译所有文本，不使用窗口期
    batchTranslateTexts(textsToTranslate, document.title)
        .then(translatedTexts => {
            console.log(`[FluentRead] 批量翻译完成，收到${translatedTexts.length}个结果`);
            
            // 更新DOM
            nodeDataList.forEach((data, index) => {
                const translatedText = translatedTexts[index];
                if (!translatedText) {
                    console.warn(`[FluentRead] 节点${index}翻译失败`);
                    return;
                }
                
                const { node } = data;
                
                if (config.display === styles.bilingualTranslation) {
                    // 双语显示
                    const originalHTML = node.innerHTML;
                    const bilingualDiv = document.createElement('div');
                    bilingualDiv.className = 'fluent-read-bilingual-content';
                    bilingualDiv.innerHTML = translatedText;
                    
                    node.innerHTML = '';
                    
                    const originalDiv = document.createElement('div');
                    originalDiv.className = 'fluent-read-original';
                    originalDiv.innerHTML = originalHTML;
                    
                    node.appendChild(originalDiv);
                    node.appendChild(bilingualDiv);
                    node.classList.add('fluent-read-bilingual');
                } else {
                    // 单语显示
                    node.textContent = translatedText;
                }
            });
            
            console.log(`[FluentRead] 全部翻译完成并更新到DOM`);
            // 启动定期重新扫描
            startRescan();
        })
        .catch(error => {
            console.error('[FluentRead] 批量翻译失败:', error);
        });
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
    stopRescan(); // 停止重新扫描
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

    // 如果超过7000 tokens，则截断
    let nodes = allNodes;
    if (totalTokens > MAX_TRANSLATION_TOKENS) {
        console.log(`[FluentRead] 全文超过${MAX_TRANSLATION_TOKENS} tokens限制，将只翻译前${MAX_TRANSLATION_TOKENS} tokens`);
        nodes = truncateNodesByTokens(allNodes, MAX_TRANSLATION_TOKENS);
    } else {
        console.log(`[FluentRead] 全文未超过限制，将翻译全部内容`);
    }

    isAutoTranslating = true;
    firstBatchCompleted = false; // 重置第一批完成标记

    // 准备所有节点数据（去重和过滤）
    const nodeDataList: Array<{node: Element, nodeId: string, text: string}> = [];
    
    nodes.forEach((node) => {
        // 去重
        if (node.hasAttribute(TRANSLATED_ATTR)) return;
        
        // 检查祖先节点是否已经被翻译，如果是则跳过
        let ancestor = node.parentElement;
        let hasTranslatedAncestor = false;
        while (ancestor) {
            if (ancestor.hasAttribute(TRANSLATED_ATTR)) {
                hasTranslatedAncestor = true;
                break;
            }
            ancestor = ancestor.parentElement;
        }
        if (hasTranslatedAncestor) return;
        
        // 为节点分配唯一ID
        const nodeId = `fr-node-${nodeIdCounter++}`;
        node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
        
        // 保存原始内容
        originalContents.set(nodeId, node.innerHTML);
        
        // 标记为已翻译
        node.setAttribute(TRANSLATED_ATTR, 'true');
        
        nodeDataList.push({
            node,
            nodeId,
            text: node.textContent || ''
        });
    });
    
    console.log(`[FluentRead] 过滤后需要翻译${nodeDataList.length}个节点`);
    
    if (nodeDataList.length === 0) {
        console.log('[FluentRead] 没有需要翻译的节点');
        return;
    }
    
    // 收集所有文本
    const textsToTranslate = nodeDataList.map(data => data.text);
    
    // 直接批量翻译所有文本，不经过窗口期队列
    batchTranslateTexts(textsToTranslate, document.title)
        .then(translatedTexts => {
            console.log(`[FluentRead] 批量翻译完成，收到${translatedTexts.length}个结果`);
            
            // 更新DOM
            nodeDataList.forEach((data, index) => {
                const translatedText = translatedTexts[index];
                if (!translatedText) {
                    console.warn(`[FluentRead] 节点${index}翻译失败`);
                    return;
                }
                
                const { node } = data;
                
                if (config.display === styles.bilingualTranslation) {
                    // 双语显示
                    const originalHTML = node.innerHTML;
                    const bilingualDiv = document.createElement('div');
                    bilingualDiv.className = 'fluent-read-bilingual-content';
                    bilingualDiv.innerHTML = translatedText;
                    
                    node.innerHTML = '';
                    
                    const originalDiv = document.createElement('div');
                    originalDiv.className = 'fluent-read-original';
                    originalDiv.innerHTML = originalHTML;
                    
                    node.appendChild(originalDiv);
                    node.appendChild(bilingualDiv);
                    node.classList.add('fluent-read-bilingual');
                } else {
                    // 单语显示
                    node.textContent = translatedText;
                }
            });
            
            console.log(`[FluentRead] 全部翻译完成并更新到DOM`);
            
            // 标记第一批翻译完成
            firstBatchCompleted = true;
            startDwellTimeDetection(); // 启动停留检测
        })
        .catch(error => {
            console.error('[FluentRead] 批量翻译失败:', error);
        });

    // 创建 MutationObserver 监听 DOM 变化，直接翻译新增节点
    mutationObserver = new MutationObserver((mutations) => {
        if (!isAutoTranslating) return;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // 元素节点
                    // 只处理未翻译的新节点
                    const newNodes = grabAllNode(node as Element).filter(
                        n => !n.hasAttribute(TRANSLATED_ATTR)
                    );
                    
                    // 直接翻译新节点，不使用IntersectionObserver
                    newNodes.forEach(n => {
                        // 检查祖先节点是否已经被翻译
                        let ancestor = n.parentElement;
                        let hasTranslatedAncestor = false;
                        while (ancestor) {
                            if (ancestor.hasAttribute(TRANSLATED_ATTR)) {
                                hasTranslatedAncestor = true;
                                break;
                            }
                            ancestor = ancestor.parentElement;
                        }
                        if (hasTranslatedAncestor) return;
                        
                        // 为节点分配唯一ID
                        const nodeId = `fr-node-${nodeIdCounter++}`;
                        n.setAttribute(TRANSLATED_ID_ATTR, nodeId);
                        
                        // 保存原始内容
                        originalContents.set(nodeId, n.innerHTML);
                        
                        // 标记为已翻译
                        n.setAttribute(TRANSLATED_ATTR, 'true');
                        
                        // 立即翻译
                        if (config.display === styles.bilingualTranslation) {
                            handleBilingualTranslation(n, false);
                        } else {
                            handleSingleTranslation(n, false);
                        }
                    });
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
        .then((text: any) => {
            spinner.remove();
            htmlSet.delete(nodeOuterHTML);
            
            // 确保text是字符串
            if (typeof text !== 'string') {
                console.error('[bilingualTranslate] 翻译结果不是字符串:', typeof text, text);
                text = String(text);
            }
            
            // 检查翻译结果是否与原文相同
            if (text === origin) {
                console.warn('[bilingualTranslate] 翻译结果与原文相同，原文:', origin.substring(0, 100));
            }
            
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
        .then((text: any) => {
            spinner.remove();
            
            // 确保text是字符串
            if (typeof text !== 'string') {
                console.error('[singleTranslate] 翻译结果不是字符串:', typeof text, text);
                text = String(text);
            }
            
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
    // 确保text是字符串
    if (typeof text !== 'string') {
        console.error('[bilingualAppendChild] text不是字符串:', typeof text, text);
        text = String(text);
    }
    
    node.classList.add("fluent-read-bilingual");
    let newNode = document.createElement("span");
    newNode.classList.add("fluent-read-bilingual-content");
    // find the style
    const style = options.styles.find(s => s.value === config.style && !s.disabled);
    if (style?.class) {
        newNode.classList.add(style.class);
    }
    newNode.textContent = text; // 使用textContent而不append，更安全
    smashTruncationStyle(node);
    node.appendChild(newNode);
}