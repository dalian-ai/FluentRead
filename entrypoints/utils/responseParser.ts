/**
 * API 响应解析器
 * 处理各种 AI API 返回格式，提取翻译内容
 */

import { z } from 'zod';

/**
 * 翻译结果的校验 Schema
 */
export const translationSchema = z.object({
  translations: z.array(
    z.object({
      index: z.number(),
      text: z.string()
    })
  )
});

export type TranslationResult = z.infer<typeof translationSchema>;

/**
 * 响应解析结果
 */
export interface ParseResult {
  success: boolean;
  data?: TranslationResult;
  error?: string;
  debugInfo?: {
    rawContentType: string;
    cleanedContent?: string;
    parseMethod: 'direct' | 'json-repair' | 'regex-fallback';
  };
}

/**
 * 从 API 响应中提取 content
 * 注意：自动忽略 reasoning 字段（用于推理模型如 OpenAI o1、GLM-4.5 等）
 */
export function extractContent(apiResponse: any): string {
  // 优先从 choices[0].message.content 提取（标准 OpenAI 格式）
  // 注意：即使 message 中有 reasoning 字段，我们也只提取 content
  return apiResponse.choices?.[0]?.message?.content || 
         apiResponse.output?.[0]?.content || 
         apiResponse.content || 
         "";
}

/**
 * 清理 JSON 字符串
 * 移除 markdown 代码块、前后空白、AI 的额外说明等
 */
export function cleanJsonString(rawContent: string): string {
  let cleaned = rawContent.trim();
  
  // 移除 markdown 代码块标记
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  }
  
  // 移除前导换行符和空白
  cleaned = cleaned.trim();
  
  // 定位真正的 JSON 边界（防止 AI 输出 "Here is the result: { ... }"）
  const startIndex = cleaned.indexOf('{');
  const endIndex = cleaned.lastIndexOf('}');
  if (startIndex !== -1 && endIndex !== -1) {
    cleaned = cleaned.substring(startIndex, endIndex + 1);
  }
  
  return cleaned;
}

/**
 * 尝试修复不完整的 JSON（处理截断情况）
 */
export function repairTruncatedJson(content: string): string | null {
  if (!content.includes('"translations"')) {
    return null;
  }
  
  try {
    // 提取 translations 数组部分
    const translationsMatch = content.match(/"translations"\s*:\s*\[([\s\S]*?)(?:\]|}|$)/);
    if (!translationsMatch) {
      return null;
    }
    
    let arrayContent = translationsMatch[1];
    
    // 修复可能不完整的最后一个对象
    // 找到所有完整的对象（以 } 结尾）
    const completeObjects: string[] = [];
    let depth = 0;
    let currentObj = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i];
      
      if (escapeNext) {
        currentObj += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        currentObj += char;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') depth--;
      }
      
      currentObj += char;
      
      // 找到一个完整的对象
      if (!inString && depth === 0 && currentObj.trim().endsWith('}')) {
        completeObjects.push(currentObj.trim().replace(/,\s*$/, '')); // 移除尾部逗号
        currentObj = '';
      }
    }
    
    if (completeObjects.length === 0) {
      return null;
    }
    
    // 构造完整的 JSON
    return `{"translations":[${completeObjects.join(',')}]}`;
  } catch (error) {
    return null;
  }
}

/**
 * 使用正则表达式提取翻译（最后的回退方案）
 */
export function extractByRegex(content: string): TranslationResult | null {
  const translations: { index: number; text: string }[] = [];
  
  // 匹配 [数字] 内容，直到下一个 [数字] 或结尾
  const lineRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\s*\[\d+\]|$)/g;
  let match;
  
  while ((match = lineRegex.exec(content)) !== null) {
    if (match[1] && match[2]) {
      translations.push({
        index: parseInt(match[1], 10),
        text: match[2].trim()
      });
    }
  }
  
  if (translations.length > 0) {
    return { translations };
  }
  
  return null;
}

/**
 * 移除翻译文本中的序号标记
 */
export function removeIndexMarkers(translations: TranslationResult): TranslationResult {
  return {
    translations: translations.translations.map(item => ({
      index: item.index,
      text: item.text.replace(/^\[\d+\]\s*/, '') // 移除 "[数字] "
    }))
  };
}

/**
 * 解析 API 响应
 */
export function parseApiResponse(rawContent: string | object, requestId: string = 'unknown'): ParseResult {
  const debugInfo: ParseResult['debugInfo'] = {
    rawContentType: typeof rawContent,
    parseMethod: 'direct'
  };
  
  try {
    // 如果已经是对象，直接使用
    if (typeof rawContent === 'object' && rawContent !== null) {
      const validated = translationSchema.parse(rawContent);
      return {
        success: true,
        data: removeIndexMarkers(validated),
        debugInfo
      };
    }
    
    // 字符串处理流程
    const contentStr = String(rawContent);
    
    // 1. 尝试直接解析
    try {
      const cleaned = cleanJsonString(contentStr);
      debugInfo.cleanedContent = cleaned.substring(0, 200);
      
      const parsed = JSON.parse(cleaned);
      const validated = translationSchema.parse(parsed);
      
      return {
        success: true,
        data: removeIndexMarkers(validated),
        debugInfo
      };
    } catch (directError) {
      console.log(`[ResponseParser] [RequestId: ${requestId}] 直接解析失败:`, directError);
    }
    
    // 2. 尝试修复截断的 JSON
    debugInfo.parseMethod = 'json-repair';
    const repaired = repairTruncatedJson(contentStr);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        const validated = translationSchema.parse(parsed);
        
        console.log(`[ResponseParser] [RequestId: ${requestId}] JSON 修复成功`);
        return {
          success: true,
          data: removeIndexMarkers(validated),
          debugInfo
        };
      } catch (repairError) {
        console.log(`[ResponseParser] [RequestId: ${requestId}] JSON 修复失败:`, repairError);
      }
    }
    
    // 3. 使用正则表达式提取（最后的回退）
    debugInfo.parseMethod = 'regex-fallback';
    const regexResult = extractByRegex(contentStr);
    if (regexResult) {
      console.log(`[ResponseParser] [RequestId: ${requestId}] 正则回退成功`);
      return {
        success: true,
        data: removeIndexMarkers(regexResult),
        debugInfo
      };
    }
    
    // 所有方法都失败了
    return {
      success: false,
      error: `无法解析内容 (RequestId: ${requestId})`,
      debugInfo
    };
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
      debugInfo
    };
  }
}

/**
 * 完整的 API 响应处理（提取 + 解析）
 * 这是推荐的一步到位方法
 * 
 * @param apiResponse - 完整的 API 响应对象（包含 choices、message 等）
 * @param requestId - 可选的请求 ID
 * @returns 解析结果
 * 
 * @example
 * ```typescript
 * const apiResponse = await fetch(...).then(r => r.json());
 * const result = parseFullApiResponse(apiResponse, 'req-123');
 * if (result.success) {
 *   console.log(result.data.translations);
 * }
 * ```
 */
export function parseFullApiResponse(apiResponse: any, requestId: string = 'unknown'): ParseResult {
  const content = extractContent(apiResponse);
  
  if (!content) {
    return {
      success: false,
      error: `API 返回空内容 (RequestId: ${requestId})`,
      debugInfo: {
        rawContentType: typeof apiResponse,
        parseMethod: 'direct'
      }
    };
  }
  
  return parseApiResponse(content, requestId);
}
