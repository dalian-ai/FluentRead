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
const MAX_TOKEN_RATIO = 8;         // 翻译结果最大token比率（译文不应超过原文的8倍）
const MIN_TOKEN_RATIO = 0.125;     // 翻译结果最小token比率（译文不应少于原文的1/8）

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
 * 验证批量翻译结果的合法性
 * @param originalTexts 原始文本列表
 * @param translatedTexts 翻译结果列表
 * @returns 验证结果 { valid: boolean, invalidIndices: number[], reasons: string[] }
 */
function validateBatchTranslations(
  originalTexts: string[], 
  translatedTexts: string[]
): { valid: boolean; invalidIndices: number[]; reasons: string[] } {
  const invalidIndices: number[] = [];
  const reasons: string[] = [];
  
  // 验证1：确保列表大小一致
  if (originalTexts.length !== translatedTexts.length) {
    console.error('[批量翻译验证] 列表大小不一致！', {
      原文数量: originalTexts.length,
      译文数量: translatedTexts.length
    });
    return {
      valid: false,
      invalidIndices: Array.from({ length: originalTexts.length }, (_, i) => i),
      reasons: [`列表大小不匹配：原文${originalTexts.length}条，译文${translatedTexts.length}条`]
    };
  }
  
  // 验证2：检查每条翻译的token比率
  for (let i = 0; i < originalTexts.length; i++) {
    const originalText = originalTexts[i];
    const translatedText = translatedTexts[i];
    
    // 跳过空内容
    if (!originalText || !translatedText) {
      if (originalText && !translatedText) {
        invalidIndices.push(i);
        reasons.push(`索引${i}: 翻译结果为空`);
      }
      continue;
    }
    
    const originalTokens = estimateTokenCount(originalText);
    const translatedTokens = estimateTokenCount(translatedText);
    
    // 避免除以0
    if (originalTokens === 0) continue;
    
    const ratio = translatedTokens / originalTokens;
    
    // 检查是否超出合理范围
    if (ratio > MAX_TOKEN_RATIO) {
      invalidIndices.push(i);
      reasons.push(
        `索引${i}: 译文过长 (${translatedTokens} tokens vs 原文 ${originalTokens} tokens, 比率 ${ratio.toFixed(2)})`
      );
      console.warn(`[批量翻译验证] 索引${i}译文过长:`, {
        原文: originalText.substring(0, 50),
        译文: translatedText.substring(0, 50),
        原文tokens: originalTokens,
        译文tokens: translatedTokens,
        比率: ratio.toFixed(2)
      });
    } else if (ratio < MIN_TOKEN_RATIO) {
      invalidIndices.push(i);
      reasons.push(
        `索引${i}: 译文过短 (${translatedTokens} tokens vs 原文 ${originalTokens} tokens, 比率 ${ratio.toFixed(2)})`
      );
      console.warn(`[批量翻译验证] 索引${i}译文过短:`, {
        原文: originalText.substring(0, 50),
        译文: translatedText.substring(0, 50),
        原文tokens: originalTokens,
        译文tokens: translatedTokens,
        比率: ratio.toFixed(2)
      });
    }
  }
  
  const valid = invalidIndices.length === 0;
  
  if (valid) {
    console.log('[批量翻译验证] ✓ 所有翻译通过验证');
  } else {
    console.warn('[批量翻译验证] ✗ 发现异常翻译:', {
      异常数量: invalidIndices.length,
      总数: originalTexts.length,
      异常索引: invalidIndices,
      原因: reasons
    });
  }
  
  return { valid, invalidIndices, reasons };
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
  
  // 过滤无效任务（虽然在添加时已检查，但双重保险）
  const invalidTasks = allTasks.filter(task => !isValidText(task.origin));
  if (invalidTasks.length > 0) {
    console.warn(`[批量翻译] 过滤掉 ${invalidTasks.length} 个无效任务`);
    invalidTasks.forEach(task => task.resolve(task.origin));
  }
  
  const tasks = allTasks.filter(task => isValidText(task.origin));
  
  if (tasks.length === 0) {
    isProcessing = false;
    return;
  }
  
  try {
    // 分组处理 - 并行处理所有批次以提高速度（即使只有1个任务也使用批量翻译）
    const groups = groupTasks(tasks);
    
    console.log(`[批量翻译] 分为${groups.length}个批次并行处理`);
    
    // 并行处理所有批次
    await Promise.all(groups.map(async (group) => {
      try {
        await translateBatch(group);
      } catch (error) {
        // 批量翻译失败，标记所有任务失败
        console.error('[批量翻译] 批次翻译失败:', error);
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
  // 去重优化：找出所有唯一的文本
  const uniqueTexts = new Map<string, number[]>(); // text -> [indices]
  tasks.forEach((task, index) => {
    const text = task.origin;
    if (!uniqueTexts.has(text)) {
      uniqueTexts.set(text, []);
    }
    uniqueTexts.get(text)!.push(index);
  });
  
  // 如果所有文本都是唯一的，使用原逻辑
  if (uniqueTexts.size === tasks.length) {
    return translateBatchNormal(tasks);
  }
  
  // 有重复文本，只翻译唯一的
  const uniqueTasksList = Array.from(uniqueTexts.entries()).map(([text, indices], idx) => ({
    origin: text,
    context: tasks[indices[0]].context,
    resolve: (result: string) => {}, // 临时占位
    reject: (error: any) => {},
    timestamp: Date.now(),
    originalIndices: indices, // 保存原始索引
  }));
  
  // 构建批量翻译的提示词（文本已在 translateApi 中清理过）
  const origins = uniqueTasksList.map((task, index) => `[${index + 1}] ${task.origin}`).join('\n\n');
  
  // 调试日志：打印前3个发送的原文
  console.log('[批量翻译-去重] 发送的前3个原文:');
  uniqueTasksList.slice(0, 3).forEach((task, idx) => {
    console.log(`  [${idx + 1}] ${task.origin.substring(0, 100)}...`);
  });
  
  // 发送批量翻译请求
  let result = await browser.runtime.sendMessage({
    type: 'batch_translate',
    context: uniqueTasksList[0].context,
    origin: origins,
    count: uniqueTasksList.length
  }) as string;
  
  // 确保result是字符串，如果是错误对象则提取错误信息
  if (typeof result !== 'string') {
    // 检查是否是错误对象
    if (typeof result === 'object' && result !== null && 'error' in result) {
      const errorDetail = (result as any).error;
      console.error('[批量翻译-去重] 收到错误对象:', errorDetail);
      throw new Error(errorDetail);
    }
    console.error('[批量翻译-去重] API返回结果类型异常:', typeof result, result);
    throw new Error(`API返回结果类型错误: ${typeof result}`);
  }
  
  // 调试日志：打印API返回的原始结果
  console.log('[批量翻译-去重] API返回原始结果（前500字符）:', result.substring(0, 500));
  console.log('[批量翻译-去重] API返回完整结果:', result);
  
  // 解析批量翻译结果
  const results = parseBatchTranslations(result, uniqueTasksList.length, config.service);
  
  // 调试日志：打印解析后的前3个结果
  console.log('[批量翻译-去重] 解析后的前3个结果:');
  results.slice(0, 3).forEach((text, idx) => {
    console.log(`  [DOM索引${idx}] 原文长度: ${uniqueTasksList[idx].origin.length}, 译文长度: ${text?.length || 0}`);
    console.log(`  [DOM索引${idx}] 原文前100字符: ${uniqueTasksList[idx].origin.substring(0, 100)}...`);
    console.log(`  [DOM索引${idx}] 译文前100字符: ${text?.substring(0, 100) || '(空)'}...`);
    console.log('  → 将设置 data-fr-index="' + idx + '"');
    console.log('---');
  });
  
  // 验证翻译结果
  const originalTexts = uniqueTasksList.map(task => task.origin);
  const validation = validateBatchTranslations(originalTexts, results);
  
  if (!validation.valid) {
    console.error('[批量翻译-去重] 翻译验证失败:', validation.reasons);
    // 对于验证失败的条目，使用原文
    for (const idx of validation.invalidIndices) {
      results[idx] = uniqueTasksList[idx].origin;
    }
  }
  
  // 分发结果到所有相关任务（包括重复的）
  for (let i = 0; i < uniqueTasksList.length; i++) {
    let translatedText = results[i] || uniqueTasksList[i].origin;
    const originalIndices = (uniqueTasksList[i] as any).originalIndices;
    
    // 确保translatedText是字符串
    if (typeof translatedText !== 'string') {
      console.error('[translateBatch] 翻译结果不是字符串:', typeof translatedText, translatedText);
      translatedText = String(translatedText);
    }
    
    // 缓存一次
    if (config.useCache) {
      cache.localSet(uniqueTasksList[i].origin, translatedText);
    }
    
    // 分发到所有使用该文本的任务
    for (const idx of originalIndices) {
      tasks[idx].resolve(translatedText);
    }
  }
}

/**
 * 正常批量翻译（无重复文本）
 */
async function translateBatchNormal(tasks: BatchTask[]) {
  // 构建批量翻译的提示词（文本已在 translateApi 中清理过）
  const origins = tasks.map((task, index) => `[${index + 1}] ${task.origin}`).join('\n\n');
  
  console.log('[批量翻译] 发送批量翻译请求，任务数:', tasks.length, 'Provider:', config.service);
  
  // 发送批量翻译请求
  let result = await browser.runtime.sendMessage({
    type: 'batch_translate',
    context: tasks[0].context, // 使用第一个任务的上下文
    origin: origins,
    count: tasks.length
  }) as string;
  
  // 确保result是字符串，如果是错误对象则提取错误信息
  if (typeof result !== 'string') {
    // 检查是否是错误对象
    if (typeof result === 'object' && result !== null && 'error' in result) {
      const errorDetail = (result as any).error;
      console.error('[批量翻译-正常] 收到错误对象:', errorDetail, 'Provider:', config.service);
      throw new Error(errorDetail);
    }
    console.error('[批量翻译-正常] API返回结果类型异常:', typeof result, result, 'Provider:', config.service);
    throw new Error(`API返回结果类型错误: ${typeof result}`);
  }
  
  console.log('[批量翻译] 收到翻译结果，长度:', result.length, '预览:', result.substring(0, 200), 'Provider:', config.service);
  
  // 解析批量翻译结果
  const results = parseBatchTranslations(result, tasks.length, config.service);
  
  console.log('[批量翻译] 解析后结果数:', results.length);
  
  // 验证翻译结果
  const originalTexts = tasks.map(task => task.origin);
  const validation = validateBatchTranslations(originalTexts, results);
  
  if (!validation.valid) {
    console.error('[批量翻译-正常] 翻译验证失败:', validation.reasons);
    // 对于验证失败的条目，使用原文
    for (const idx of validation.invalidIndices) {
      results[idx] = tasks[idx].origin;
    }
  }
  
  // 分发结果到各个任务
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    let translatedText = results[i] || task.origin; // 如果解析失败，返回原文
    
    // 确保translatedText是字符串
    if (typeof translatedText !== 'string') {
      console.error('[translateBatchNormal] 翻译结果不是字符串:', typeof translatedText, translatedText);
      translatedText = String(translatedText);
    }
    
    // 检查是否与原文相同
    if (translatedText === task.origin) {
      //console.warn('[批量翻译] 任务', i + 1, '翻译结果与原文相同，原文:', task.origin.substring(0, 50));
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
      console.warn('[批量翻译] 跳过无效文本:', origin);
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
  console.log(`[直接批量翻译] 开始翻译 ${texts.length} 个文本`);
  
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
  
  console.log(`[直接批量翻译] ${results.filter(r => r !== null).length} 个来自缓存, ${uncachedTasks.length} 个需要翻译`);
  
  if (uncachedTasks.length === 0) {
    return results as string[];
  }
  
  // 按token限制分组
  const groups = groupTasks(uncachedTasks);
  console.log(`[直接批量翻译] 分为 ${groups.length} 个批次，最大并发${MAX_CONCURRENT_BATCHES}`);
  
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
        console.log(`[直接批量翻译] 开始批次 ${groupIndex + 1}/${groups.length}`);
        try {
          await translateBatch(group);
          console.log(`[直接批量翻译] 完成批次 ${groupIndex + 1}/${groups.length}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[直接批量翻译] 批次 ${groupIndex + 1} 翻译失败:`, errorMsg, error);
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
  
  console.log(`[直接批量翻译] 完成，成功: ${results.filter(r => r !== null).length}/${texts.length}`);
  
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
  console.log('[批量翻译] 开始翻译整个页面');
  
  // 获取所有文本节点
  const allNodes = getAllTextNodes(rootElement);
  console.log(`[批量翻译] 找到 ${allNodes.length} 个文本节点`);
  
  if (allNodes.length === 0) {
    console.log('[批量翻译] 没有需要翻译的节点');
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
  
  console.log(`[批量翻译] 过滤后需要翻译 ${nodesToTranslate.length} 个节点`);
  
  if (nodesToTranslate.length === 0) {
    console.log('[批量翻译] 所有内容已翻译');
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
      console.warn(`[批量翻译] 节点 ${index} 翻译失败`);
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
  
  console.log('[批量翻译] 页面翻译完成并更新到 DOM');
}

/**
 * 恢复所有翻译
 * @param originalContentsMap 保存原始内容的 Map
 */
export function restoreAllTranslations(originalContentsMap: Map<string, string>) {
  console.log('[批量翻译] 开始恢复原文');
  
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
  console.log('[批量翻译] 原文恢复完成');
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
