/**
 * 翻译API代理模块
 * 整合翻译队列管理，作为翻译函数和后台翻译服务之间的中间层
 */

import { enqueueTranslation, clearTranslationQueue, getQueueStatus } from './translateQueue';
import { batchTranslate, clearBatchQueue, flushBatchQueue } from './batchTranslate';
import browser from 'webextension-polyfill';
import { config } from './config';
import { cache } from './cache';
import { detectlang } from './common';
import { storage } from '@wxt-dev/storage';

// 调试相关
const isDev = process.env.NODE_ENV === 'development';

/**
 * 翻译API的统一入口
 * 所有翻译请求都应该通过此函数发送，以便集中管理队列和重试逻辑
 * 
 * @param origin 原始文本
 * @param context 上下文信息，通常是页面标题
 * @param options 翻译选项
 * @returns 翻译结果的Promise
 */
export async function translateText(origin: string, context: string = document.title, options: TranslateOptions = {}): Promise<string> {
  const {
    maxRetries = 3, 
    retryDelay = 1000, 
    timeout = 45000,
    useCache = config.useCache,
    useBatch = config.useBatchTranslate ?? true, // 默认启用批量翻译
  } = options;

  // 如果目标语言与当前文本语言相同，直接返回原文
  if (detectlang(origin.replace(/[\s\u3000]/g, '')) === config.to) {
    return origin;
  }

  // 检查缓存
  if (useCache) {
    const cachedResult = cache.localGet(origin);
    if (cachedResult) {
      if (isDev) {
        console.log('[翻译API] 命中缓存，直接返回缓存结果');
      }
      return cachedResult;
    }
  }

  // 清理文本：去除首尾空白，将连续空白替换为单个空格
  const cleanedOrigin = origin.trim().replace(/\s+/g, ' ');
  
  // 如果清理后文本为空，直接返回原文
  if (!cleanedOrigin) {
    return origin;
  }

  // 增加翻译计数
  config.count++;
  // 保存配置以确保计数持久化
  storage.setItem('local:config', JSON.stringify(config));

  // 如果启用批量翻译，使用批处理管道
  if (useBatch) {
    return enqueueTranslation(async () => {
      return batchTranslate(cleanedOrigin, context);
    });
  }

  // 否则使用原有的单独翻译逻辑
  return enqueueTranslation(async () => {
    // 创建翻译任务
    const translationTask = async (retryCount: number = 0): Promise<string> => {
      try {
        // 发送翻译请求给background脚本处理
        const rawResult = await Promise.race([
          browser.runtime.sendMessage({ context, origin: cleanedOrigin }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('翻译请求超时')), timeout)
          )
        ]) as string;

        // 解析JSON格式的翻译结果
        let result: string;
        try {
          const jsonResult = JSON.parse(rawResult);
          if (jsonResult.translation) {
            // 单个翻译的JSON格式: {"translation":"译文"}
            result = jsonResult.translation;
          } else {
            // 如果不是预期的JSON格式，使用原始结果
            result = rawResult;
          }
        } catch (e) {
          // JSON解析失败，使用原始结果
          result = rawResult;
        }

        // 如果翻译结果为空或与原文完全相同，直接返回原文
        if (!result || result === origin) {
          return origin;
        }

        // 缓存翻译结果
        if (useCache) {
          cache.localSet(cleanedOrigin, result);
        }

        return result;
      } catch (error) {
        // 处理错误，根据重试策略决定是否重试
        if (retryCount < maxRetries) {
          if (isDev) {
            console.log(`[翻译API] 翻译失败，${retryCount + 1}/${maxRetries} 次重试，原因:`, error);
          }
          
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return translationTask(retryCount + 1);
        }
        
        // 超过最大重试次数，抛出异常
        throw error;
      }
    };

    // 开始执行翻译任务
    return translationTask();
  });
}

/**
 * 当用户离开页面或主动取消翻译时，清空翻译队列
 */
export function cancelAllTranslations() {
  if (isDev) {
    console.log('[翻译API] 取消所有等待中的翻译任务');
  }
  clearTranslationQueue();
  clearBatchQueue();
}

/**
 * 立即处理所有批处理任务（用于页面卸载前）
 */
export function flushAllBatchTranslations() {
  return flushBatchQueue();
}

/**
 * 获取当前翻译队列的状态
 * 可用于UI显示翻译进度等
 */
export function getTranslationStatus() {
  return getQueueStatus();
}

/**
 * 翻译参数接口
 */
export interface TranslateOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔(毫秒) */
  retryDelay?: number;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 是否使用缓存 */
  useCache?: boolean;
  /** 是否使用批量翻译 */
  useBatch?: boolean;
} 