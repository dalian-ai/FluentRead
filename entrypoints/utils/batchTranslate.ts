/**
 * 批量翻译管道模块
 * 将多个翻译请求合并成一个API调用，提高效率并降低API调用成本
 */

import browser from 'webextension-polyfill';
import { config } from './config';
import { cache } from './cache';

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
const BATCH_WINDOW_MS = 50;       // 批处理窗口时间（毫秒）- 从300ms减少到50ms提高响应速度
const MAX_TOKENS_PER_BATCH = 4000; // 每批最大tokens数 - 与deepseek API限制保持一致
const MIN_BATCH_SIZE = 3;          // 最小批处理数量（小于此数量不进行批处理）
const MAX_CONCURRENT_BATCHES = 8;  // 最大并发批次数 - 避免同时发送过多请求

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
  
  // 获取当前队列的所有任务
  const tasks = [...batchQueue];
  batchQueue = [];
  
  try {
    // 如果任务数量少于最小批处理数量，逐个处理
    if (tasks.length < MIN_BATCH_SIZE) {
      for (const task of tasks) {
        try {
          const result = await translateSingle(task.origin, task.context);
          task.resolve(result);
        } catch (error) {
          task.reject(error);
        }
      }
      return;
    }
    
    // 分组处理 - 并行处理所有批次以提高速度
    const groups = groupTasks(tasks);
    
    console.log(`[批量翻译] 分为${groups.length}个批次并行处理`);
    
    // 并行处理所有批次
    await Promise.all(groups.map(async (group) => {
      try {
        await translateBatch(group);
      } catch (error) {
        // 批量翻译失败，尝试逐个翻译
        console.warn('[批量翻译] 批量翻译失败，回退到单独翻译:', error);
        for (const task of group) {
          try {
            const result = await translateSingle(task.origin, task.context);
            task.resolve(result);
          } catch (err) {
            task.reject(err);
          }
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
  
  // 解析批量翻译结果
  const results = parseBatchResult(result, uniqueTasksList.length);
  
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
  
  console.log('[批量翻译] 发送批量翻译请求，任务数:', tasks.length);
  
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
      console.error('[批量翻译-正常] 收到错误对象:', errorDetail);
      throw new Error(errorDetail);
    }
    console.error('[批量翻译-正常] API返回结果类型异常:', typeof result, result);
    throw new Error(`API返回结果类型错误: ${typeof result}`);
  }
  
  console.log('[批量翻译] 收到翻译结果，长度:', result.length, '预览:', result.substring(0, 200));
  
  // 解析批量翻译结果
  const results = parseBatchResult(result, tasks.length);
  
  console.log('[批量翻译] 解析后结果数:', results.length);
  
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
      console.warn('[批量翻译] 任务', i + 1, '翻译结果与原文相同，原文:', task.origin.substring(0, 50));
    }
    
    // 缓存结果
    if (config.useCache) {
      cache.localSet(task.origin, translatedText);
    }
    
    task.resolve(translatedText);
  }
}

/**
 * 解析批量翻译结果
 * 期望格式：JSON {"translations":[{"index":1,"text":"译文1"}]}
 * 回退格式：[1] 翻译结果1\n\n[2] 翻译结果2\n\n...
 */
function parseBatchResult(result: string, expectedCount: number): string[] {
  // 确保result是字符串
  if (typeof result !== 'string') {
    console.error('[批量翻译] 翻译结果不是字符串:', typeof result, result);
    try {
      result = String(result);
    } catch (e) {
      console.error('[批量翻译] 无法转换为字符串:', e);
      return new Array(expectedCount).fill('');
    }
  }
  
  console.log('[parseBatchResult] 开始解析，期望数量:', expectedCount, '结果长度:', result.length);
  
  // 首先尝试JSON格式解析
  try {
    // 提取JSON部分（可能包含markdown代码块）
    let jsonStr = result.trim();
    
    // 移除可能的markdown代码块标记
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    const parsed = JSON.parse(jsonStr);
    
    if (parsed.translations && Array.isArray(parsed.translations)) {
      const results: string[] = new Array(expectedCount).fill('');
      
      parsed.translations.forEach((item: any) => {
        if (item.index && item.text !== undefined && item.text !== null) {
          const index = parseInt(item.index) - 1;
          if (index >= 0 && index < expectedCount) {
            // 确保text是字符串
            results[index] = typeof item.text === 'string' ? item.text : String(item.text);
          }
        }
      });
      
      console.log('[parseBatchResult] JSON格式解析成功，解析到', parsed.translations.length, '个结果');
      return results;
    }
  } catch (e) {
    console.warn('[parseBatchResult] JSON解析失败，尝试文本格式:', e);
  }
  
  // 回退：尝试按序号分割 - 匹配行首的 [数字]
  const results: string[] = [];
  const pattern = /^\[(\d+)\]\s*([\s\S]*?)(?=\n\s*\[\d+\]|\s*$)/gm;
  let match;
  
  while ((match = pattern.exec(result)) !== null) {
    const index = parseInt(match[1]) - 1;
    let text = match[2].trim();
    text = text.replace(/^\[\d+\]\s*/, '');
    results[index] = text;
  }
  
  console.log('[parseBatchResult] 按序号解析到', results.length, '个结果');
  
  // 如果仍然解析失败，尝试按空行分割
  if (results.length !== expectedCount) {
    console.warn('[批量翻译] 按序号解析失败，尝试按空行分割');
    let parts = result.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    parts = parts.map(part => part.replace(/^\[\d+\]\s*/, ''));
    console.log('[parseBatchResult] 按空行解析到', parts.length, '个结果');
    return parts.slice(0, expectedCount);
  }
  
  return results;
}

/**
 * 单独翻译一个任务（回退方案）
 */
async function translateSingle(origin: string, context: string): Promise<string> {
  const result = await browser.runtime.sendMessage({
    context,
    origin
  });
  
  // 确保返回字符串
  if (typeof result !== 'string') {
    console.error('[translateSingle] 返回值不是字符串:', typeof result, result);
    return String(result);
  }
  
  return result;
}

/**
 * 添加翻译任务到批处理队列
 */
export function batchTranslate(origin: string, context: string = document.title): Promise<string> {
  return new Promise((resolve, reject) => {
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
  
  // 创建任务数组
  const tasks: BatchTask[] = texts.map((text, index) => ({
    origin: text,
    context,
    resolve: () => {},  // 临时占位
    reject: () => {},   // 临时占位
    timestamp: Date.now()
  }));
  
  // 检查缓存
  const results: (string | null)[] = new Array(texts.length).fill(null);
  const uncachedTasks: BatchTask[] = [];
  const uncachedIndices: number[] = [];
  
  for (let i = 0; i < tasks.length; i++) {
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
          console.error(`[直接批量翻译] 批次 ${groupIndex + 1} 翻译失败，错误: ${errorMsg}，回退到单独翻译`, error);
          // 失败时逐个翻译
          for (const task of group) {
            try {
              const result = await translateSingle(task.origin, task.context);
              task.resolve(result);
            } catch (err) {
              const singleErrorMsg = err instanceof Error ? err.message : String(err);
              console.error('[直接批量翻译] 单独翻译也失败:', singleErrorMsg, err);
              task.reject(err);
            }
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
