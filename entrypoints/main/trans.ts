/**
 * 简化的翻译模块 - 只保留批量翻译核心功能
 */

import { styles } from "@/entrypoints/utils/constant";
import { config } from "@/entrypoints/utils/config";
import { batchTranslateAllPageContent, restoreAllTranslations } from '@/entrypoints/utils/batchTranslate';

// 保存原始内容的映射（供恢复使用）
export let originalContents = new Map<string, string>();

// 翻译状态
let isTranslating = false;

/**
 * 自动翻译整个页面
 */
export async function autoTranslateEnglishPage() {
    if (isTranslating) {
        console.log('[FluentRead] 翻译已在进行中');
        return;
    }
    
    isTranslating = true;
    
    try {
        await batchTranslateAllPageContent(
            document.body,
            config.display === styles.bilingualTranslation,
            originalContents
        );
        console.log('[FluentRead] 页面翻译完成');
    } catch (error) {
        console.error('页面翻译失败:', error);
    } finally {
        isTranslating = false;
    }
}

/**
 * 恢复原文内容
 */
export function restoreOriginalContent() {
    restoreAllTranslations(originalContents);
    originalContents.clear();
    isTranslating = false;
}

// 页面停留时间检测相关（可选功能，暂时保留空函数以保持兼容性）
export function startDwellTimeDetection() {
    // 已移除 - 如需要可在 batchTranslate.ts 中实现
}

export function stopDwellTimeDetection() {
    // 已移除
}
