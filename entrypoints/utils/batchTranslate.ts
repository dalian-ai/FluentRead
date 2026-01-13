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

// 配置参数
const BATCH_WINDOW_MS = 50;       // 批处理窗口时间（毫秒）- 从300ms减少到50ms提高响应速度
const MAX_TOKENS_PER_BATCH = 10000; // 每批最大tokens数 - 增加到10000减少批次数
const MIN_BATCH_SIZE = 3;          // 最小批处理数量（小于此数量不进行批处理）

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
  
  // 获取当前队列的所有任务
  const tasks = [...batchQueue];
  batchQueue = [];
  
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
  const result = await browser.runtime.sendMessage({
    type: 'batch_translate',
    context: uniqueTasksList[0].context,
    origin: origins,
    count: uniqueTasksList.length
  }) as string;
  
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
  const result = await browser.runtime.sendMessage({
    type: 'batch_translate',
    context: tasks[0].context, // 使用第一个任务的上下文
    origin: origins,
    count: tasks.length
  }) as string;
  
  console.log('[批量翻译] 收到翻译结果，长度:', result?.length, '预览:', result?.substring(0, 200));
  
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
 * 期望格式：[1] 翻译结果1\n\n[2] 翻译结果2\n\n...
 */
function parseBatchResult(result: string, expectedCount: number): string[] {
  const results: string[] = [];
  
  // 确保result是字符串
  if (typeof result !== 'string') {
    console.error('[批量翻译] 翻译结果不是字符串:', typeof result, result);
    // 尝试转换为字符串
    try {
      result = String(result);
    } catch (e) {
      console.error('[批量翻译] 无法转换为字符串:', e);
      return new Array(expectedCount).fill('');
    }
  }
  
  console.log('[parseBatchResult] 开始解析，期望数量:', expectedCount, '结果长度:', result.length);
  
  // 尝试按序号分割
  const pattern = /\[(\d+)\]\s*([\s\S]*?)(?=\n*\[\d+\]|$)/g;
  let match;
  
  while ((match = pattern.exec(result)) !== null) {
    const index = parseInt(match[1]) - 1;
    const text = match[2].trim();
    results[index] = text;
  }
  
  console.log('[parseBatchResult] 按序号解析到', results.length, '个结果');
  
  // 如果解析失败，尝试按空行分割
  if (results.length !== expectedCount) {
    console.warn('[批量翻译] 按序号解析失败，尝试按空行分割');
    const parts = result.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
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
      processBatch();
      batchTimer = null;
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
