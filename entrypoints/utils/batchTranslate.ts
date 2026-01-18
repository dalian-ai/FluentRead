/**
 * 批量翻译管道模块
 * 将多个翻译请求合并成一个API调用，提高效率并降低API调用成本
 */

import browser from 'webextension-polyfill';
import { config } from './config';
import { cache } from './cache';
import { parseBatchTranslations } from './jsonParser';
import { isValidText } from './check';

// 批处理任务接口
interface BatchTask {
  origin: string;           // 原始文本
  context: string;          // 上下文
  resolve: (result: string) => void;
  reject: (error: any) => void;
  timestamp: number;        // 添加时间戳
}

// 批处理队列
let batchQueue: BatchTask[] = [];
let batchTimer: any = null;
let isProcessing = false; // 标记是否正在处理批次

// 配置参数
const BATCH_WINDOW_MS = 80;       // 批处理窗口时间（毫秒）- 从300ms减少到50ms提高响应速度
export const MAX_TOKENS_PER_BATCH = 3000; // 每批最大tokens数 - 与API限制保持一致
const MAX_CONCURRENT_BATCHES = 7;  // 最大并发批次数 - 避免同时发送过多请求

/**
 * 估算文本的token数量（简化版）
 * 英文按空格分词，中文按字符计数
 */
function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // 统计中文字符
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  const chineseCount = chineseChars ? chineseChars.length : 0;
  
  // 统计英文单词（按空格和标点分割）
  const englishWords = text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\b\w+\b/g);
  const englishCount = englishWords ? englishWords.length : 0;
  
  // 中文字符约等于1个token，英文单词约等于1.3个token
  return Math.ceil(chineseCount + englishCount * 1.3);
}

/**
 * 验证批量翻译结果：只检查数量是否一致
 */
function validateBatchTranslations(
  originalTexts: string[], 
  translatedTexts: string[]
): boolean {
  return originalTexts.length === translatedTexts.length;
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
 * 将批处理任务分组，确保每组不超过token限制
 */
function groupTasks(tasks: BatchTask[]): BatchTask[][] {
  const groups: BatchTask[][] = [];
  let currentGroup: BatchTask[] = [];
  let currentTokens = 0;
  
  for (const task of tasks) {
    const taskTokens = estimateTokens(task.origin);
    
    // 如果单个任务就超过限制，单独处理
    if (taskTokens > MAX_TOKENS_PER_BATCH) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentTokens = 0;
      }
      groups.push([task]);
      continue;
    }
    
    // 如果加入当前组会超过限制，创建新组
    if (currentTokens + taskTokens > MAX_TOKENS_PER_BATCH && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [task];
      currentTokens = taskTokens;
    } else {
      currentGroup.push(task);
      currentTokens += taskTokens;
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

/**
 * 处理批量翻译
 */
async function processBatch() {
  if (batchQueue.length === 0) return;
  
  // 如果正在处理，不重复处理
  if (isProcessing) return;
  
  isProcessing = true;
  
  // 获取当前队列的所有任务，并过滤掉无效任务
  const allTasks = [...batchQueue];
  batchQueue = [];
  
  // 过滤无效任务
  const invalidTasks = allTasks.filter(task => !isValidText(task.origin));
  if (invalidTasks.length > 0) {
    invalidTasks.forEach(task => task.resolve(task.origin));
  }
  
  const tasks = allTasks.filter(task => isValidText(task.origin));
  
  if (tasks.length === 0) {
    isProcessing = false;
    return;
  }
  
  try {
    // 分组处理
    const groups = groupTasks(tasks);
    
    // 并行处理所有批次
    await Promise.all(groups.map(async (group) => {
      try {
        await translateBatch(group);
      } catch (error) {
        console.error('批次翻译失败:', error);
        for (const task of group) {
          task.reject(error);
        }
      }
    }));
  } finally {
    isProcessing = false;
  }
}

/**
 * 批量翻译一组任务
 */
async function translateBatch(tasks: BatchTask[]) {
  // 构建批量翻译的提示词
  const origins = tasks.map((task, index) => `[${index + 1}] ${task.origin}`).join('\n\n');
  
  // 发送批量翻译请求
  let result = await browser.runtime.sendMessage({
    type: 'batch_translate',
    context: tasks[0].context,
    origin: origins,
    count: tasks.length
  }) as string;
  
  // 确保result是字符串
  if (typeof result !== 'string') {
    if (typeof result === 'object' && result !== null && 'error' in result) {
      throw new Error((result as any).error);
    }
    throw new Error(`API返回类型错误: ${typeof result}`);
  }
  
  // 解析批量翻译结果
  const results = parseBatchTranslations(result, tasks.length, config.service);
  
  // 验证数量是否一致
  const originalTexts = tasks.map(task => task.origin);
  if (!validateBatchTranslations(originalTexts, results)) {
    console.error(`翻译数量不匹配: 发送${originalTexts.length}条，收到${results.length}条`);
  }
  
  // 分发结果到各个任务
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    let translatedText = results[i] || task.origin;
    
    // 确保translatedText是字符串
    if (typeof translatedText !== 'string') {
      translatedText = String(translatedText);
    }
    
    // 缓存结果
    if (config.useCache) {
      cache.localSet(task.origin, translatedText);
    }
    
    task.resolve(translatedText);
  }
}



/**
 * 添加翻译任务到批处理队列
 */
export function batchTranslate(origin: string, context: string = document.title): Promise<string> {
  return new Promise((resolve, reject) => {
    // 验证文本有效性
    if (!isValidText(origin)) {
      console.warn('跳过无效文本:', origin);
      resolve(origin); // 返回原文
      return;
    }
    
    // 检查缓存
    if (config.useCache) {
      const cachedResult = cache.localGet(origin);
      if (cachedResult) {
        resolve(cachedResult);
        return;
      }
    }
    
    // 添加到批处理队列
    batchQueue.push({
      origin,
      context,
      resolve,
      reject,
      timestamp: Date.now()
    });
    
    // 设置批处理定时器
    if (batchTimer) {
      clearTimeout(batchTimer);
    }
    
    batchTimer = setTimeout(() => {
      batchTimer = null;
      processBatch();
    }, BATCH_WINDOW_MS);
  });
}

/**
 * 清空批处理队列
 */
export function clearBatchQueue() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  
  // 拒绝所有等待中的任务
  batchQueue.forEach(task => {
    task.reject(new Error('批处理队列已清空'));
  });
  
  batchQueue = [];
}

/**
 * 立即处理所有等待中的批处理任务
 */
export function flushBatchQueue() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  
  return processBatch();
}

/**
 * 直接批量翻译一组文本，不经过队列和窗口期
 * 用于全文翻译场景，已知所有文本，直接分批并行发送
 * @param texts 要翻译的文本数组
 * @param context 翻译上下文
 * @returns Promise<string[]> 翻译结果数组，与输入顺序对应
 */
export async function batchTranslateTexts(texts: string[], context: string = document.title): Promise<string[]> {
  console.log(`开始翻译 ${texts.length} 个文本`);
  
  // 先验证和过滤文本
  const validationResults = texts.map(text => ({
    isValid: isValidText(text),
    text
  }));
  
  const invalidCount = validationResults.filter(r => !r.isValid).length;
  if (invalidCount > 0) {
    //console.warn(`[直接批量翻译] 发现 ${invalidCount} 个无效文本，将跳过翻译`);
  }
  
  // 创建任务数组（只包含有效文本）
  const tasks: BatchTask[] = texts.map((text, index) => ({
    origin: text,
    context,
    resolve: () => {},  // 临时占位
    reject: () => {},   // 临时占位
    timestamp: Date.now()
  }));
  
  // 检查缓存和文本有效性
  const results: (string | null)[] = new Array(texts.length).fill(null);
  const uncachedTasks: BatchTask[] = [];
  const uncachedIndices: number[] = [];
  
  for (let i = 0; i < tasks.length; i++) {
    // 如果文本无效，直接返回原文
    if (!validationResults[i].isValid) {
      results[i] = texts[i];
      continue;
    }
    
    if (config.useCache) {
      const cached = cache.localGet(texts[i]);
      if (cached) {
        results[i] = cached;
        continue;
      }
    }
    uncachedTasks.push(tasks[i]);
    uncachedIndices.push(i);
  }
  
  if (uncachedTasks.length === 0) {
    return results as string[];
  }
  
  // 按token限制分组
  const groups = groupTasks(uncachedTasks);
  
  // 存储每个任务的Promise
  const taskPromises: Promise<string>[] = uncachedTasks.map(() => 
    new Promise<string>((resolve, reject) => {})
  );
  
  // 为每个任务设置resolve/reject
  uncachedTasks.forEach((task, idx) => {
    taskPromises[idx] = new Promise<string>((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });
  });
  
  // 使用滑动窗口并发控制 - 任务完成后立即启动下一个
  let currentIndex = 0;
  const executing: Promise<void>[] = [];
  
  while (currentIndex < groups.length || executing.length > 0) {
    // 启动新任务直到达到并发限制
    while (currentIndex < groups.length && executing.length < MAX_CONCURRENT_BATCHES) {
      const groupIndex = currentIndex++;
      const group = groups[groupIndex];
      
      const promise = (async () => {
        try {
          await translateBatch(group);
        } catch (error) {
          // 标记所有任务失败
          for (const task of group) {
            task.reject(error);
          }
        }
      })();
      
      executing.push(promise);
      
      // 任务完成后从执行列表中移除
      promise.then(() => {
        executing.splice(executing.indexOf(promise), 1);
      }).catch(() => {
        executing.splice(executing.indexOf(promise), 1);
      });
    }
    
    // 等待至少一个任务完成
    if (executing.length > 0) {
      await Promise.race(executing);
    }
  }
  
  // 等待所有翻译完成并填充结果
  const translatedResults = await Promise.all(taskPromises);
  uncachedIndices.forEach((originalIndex, i) => {
    results[originalIndex] = translatedResults[i];
  });
  
  console.log(`翻译完成，成功: ${results.filter(r => r !== null).length}/${texts.length}`);
  
  return results as string[];
}

/**
 * ==========================================
 * 页面批量翻译核心功能
 * ==========================================
 */

// 使用自定义属性标记已翻译的节点
const TRANSLATED_ATTR = 'data-fr-translated';
const TRANSLATED_ID_ATTR = 'data-fr-node-id';

let nodeIdCounter = 0;

/**
 * 批量翻译整个页面的所有内容
 * @param rootElement 根元素（通常是 document.body）
 * @param isBilingual 是否双语显示
 * @param originalContentsMap 用于保存原始内容的 Map
 */
export async function batchTranslateAllPageContent(
  rootElement: Element,
  isBilingual: boolean,
  originalContentsMap: Map<string, string>
) {
  console.log('开始翻译整个页面');
  
  // 获取所有文本节点
  const allNodes = getAllTextNodes(rootElement);
  console.log(`找到 ${allNodes.length} 个文本节点`);
  
  if (allNodes.length === 0) {
    console.log('没有需要翻译的节点');
    return;
  }
  
  // 过滤已翻译的节点和有已翻译祖先的节点
  const nodesToTranslate = allNodes.filter(node => {
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
  
  console.log(`过滤后需要翻译 ${nodesToTranslate.length} 个节点`);
  
  if (nodesToTranslate.length === 0) {
    console.log('所有内容已翻译');
    return;
  }
  
  // 准备节点数据
  const nodeDataList = nodesToTranslate.map(node => {
    const nodeId = `fr-node-${nodeIdCounter++}`;
    node.setAttribute(TRANSLATED_ID_ATTR, nodeId);
    node.setAttribute(TRANSLATED_ATTR, 'true');
    
    // 保存原始内容
    originalContentsMap.set(nodeId, node.innerHTML);
    
    return {
      node,
      nodeId,
      text: node.textContent || ''
    };
  });
  
  // 提取要翻译的文本
  const textsToTranslate = nodeDataList.map(data => data.text);
  
  // 批量翻译
  const translatedTexts = await batchTranslateTexts(textsToTranslate, document.title);
  
  // 更新 DOM
  nodeDataList.forEach((data, index) => {
    const translatedText = translatedTexts[index];
    if (!translatedText) {
      console.warn(`[翻译] 节点 ${index} 翻译失败`);
      return;
    }
    
    const { node } = data;
    
    if (isBilingual) {
      // 双语显示
      const originalHTML = node.innerHTML;
      const bilingualDiv = document.createElement('div');
      bilingualDiv.className = 'fluent-read-bilingual-content';
      bilingualDiv.textContent = translatedText;
      
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
}

/**
 * 恢复所有翻译
 * @param originalContentsMap 保存原始内容的 Map
 */
export function restoreAllTranslations(originalContentsMap: Map<string, string>) {
  // 恢复所有已翻译的节点
  document.querySelectorAll(`[${TRANSLATED_ATTR}="true"]`).forEach(node => {
    const nodeId = node.getAttribute(TRANSLATED_ID_ATTR);
    if (nodeId && originalContentsMap.has(nodeId)) {
      const originalContent = originalContentsMap.get(nodeId);
      node.innerHTML = originalContent!;
      node.removeAttribute(TRANSLATED_ATTR);
      node.removeAttribute(TRANSLATED_ID_ATTR);
      node.classList.remove('fluent-read-bilingual');
    }
  });
  
  // 移除翻译内容元素
  document.querySelectorAll('.fluent-read-bilingual-content').forEach(el => el.remove());
  document.querySelectorAll('.fluent-read-original').forEach(el => {
    // 将原文内容提升到父节点
    const parent = el.parentElement;
    if (parent) {
      parent.innerHTML = el.innerHTML;
    }
  });
  
  nodeIdCounter = 0;
}

/**
 * 获取所有文本节点
 */
function getAllTextNodes(root: Element): Element[] {
  const result: Element[] = [];
  const skipTags = new Set(['script', 'style', 'noscript', 'iframe', 'code', 'pre', 'svg']);
  
  function traverse(element: Element) {
    const tag = element.tagName?.toLowerCase();
    
    // 跳过不需要翻译的标签
    if (skipTags.has(tag)) return;
    if (element.classList?.contains('notranslate')) return;
    if (element.classList?.contains('sr-only')) return;
    
    // 检查是否有直接的文本内容
    let hasDirectText = false;
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        hasDirectText = true;
        break;
      }
    }
    
    if (hasDirectText && !result.includes(element)) {
      result.push(element);
    }
    
    // 继续遍历子元素
    for (const child of element.children) {
      traverse(child);
    }
  }
  
  traverse(root);
  return result;
}
