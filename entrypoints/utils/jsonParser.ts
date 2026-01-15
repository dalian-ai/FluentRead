/**
 * JSON解析工具模块
 * 统一处理翻译结果的JSON解析逻辑
 */

/**
 * 解析单个翻译的JSON结果
 * 期望格式：{"translation":"译文"}
 * 回退：返回原始字符串
 */
export function parseSingleTranslation(result: string): string {
  if (typeof result !== 'string') {
    return String(result);
  }

  try {
    // 移除可能的markdown代码块标记
    let jsonStr = result.trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    const parsed = JSON.parse(jsonStr);
    
    if (parsed.translation !== undefined && parsed.translation !== null) {
      return typeof parsed.translation === 'string' ? parsed.translation : String(parsed.translation);
    }
  } catch (e) {
    // JSON解析失败，返回原始字符串
  }
  
  return result;
}

/**
 * 解析批量翻译的JSON结果
 * 期望格式：{"translations":[{"index":1,"text":"译文1"},{"index":2,"text":"译文2"}]}
 * 回退格式1：按序号分割 [1] 译文1\n\n[2] 译文2
 * 回退格式2：按空行分割
 */
export function parseBatchTranslations(result: string, expectedCount: number, provider?: string): string[] {
  const providerInfo = provider ? `[Provider: ${provider}]` : '';
  
  // 确保result是字符串
  if (typeof result !== 'string') {
    console.error('[JSON解析]', providerInfo, '翻译结果不是字符串:', typeof result, result);
    try {
      result = String(result);
    } catch (e) {
      console.error('[JSON解析]', providerInfo, '无法转换为字符串:', e);
      return new Array(expectedCount).fill('');
    }
  }
  
  console.log('[JSON解析]', providerInfo, '开始解析批量结果，期望数量:', expectedCount, '结果长度:', result.length);
  
  // 首先尝试JSON格式解析
  try {
    // 提取JSON部分（可能包含markdown代码块或其他文本）
    let jsonStr = result.trim();
    
    // 移除可能的markdown代码块标记
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    // 移除可能的<think>标签（有些模型会在JSON外包含推理过程）
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // 移除可能的翻译说明
    jsonStr = jsonStr.replace(/[（(]\s*翻译说明[\s\S]*?[）)]/g, '').trim();
    
    // 尝试查找JSON对象的起始位置（{或[）
    const jsonStartMatch = jsonStr.match(/[{\[]/);
    if (jsonStartMatch && jsonStartMatch.index! > 0) {
      console.warn('[JSON解析]', providerInfo, '检测到JSON前有额外文本，自动跳过前', jsonStartMatch.index, '个字符');
      console.warn('[JSON解析]', providerInfo, '被跳过的内容:', jsonStr.substring(0, jsonStartMatch.index));
      jsonStr = jsonStr.substring(jsonStartMatch.index!);
    }
    
    // 尝试查找JSON对象的结束位置
    const jsonEndMatch = jsonStr.match(/[}\]]\s*$/);
    if (jsonEndMatch) {
      const endPos = jsonEndMatch.index! + jsonEndMatch[0].length;
      if (endPos < jsonStr.length) {
        console.warn('[JSON解析]', providerInfo, 'JSON后有额外文本，自动截断');
        jsonStr = jsonStr.substring(0, endPos);
      }
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // 格式1：标准格式 {"translations":[{"index":1,"text":"译文1"}]}
    if (parsed.translations && Array.isArray(parsed.translations)) {
      const results: string[] = new Array(expectedCount).fill('');
      
      parsed.translations.forEach((item: any) => {
        // 支持对象格式：{"index":1,"text":"译文"}
        if (item.index && item.text !== undefined && item.text !== null) {
          const index = parseInt(item.index) - 1;
          if (index >= 0 && index < expectedCount) {
            results[index] = typeof item.text === 'string' ? item.text : String(item.text);
          }
        }
        // 支持数组格式：[1, "译文"]
        else if (Array.isArray(item) && item.length >= 2) {
          const index = parseInt(item[0]) - 1;
          if (index >= 0 && index < expectedCount) {
            results[index] = typeof item[1] === 'string' ? item[1] : String(item[1]);
          }
        }
      });
      
      console.log('[JSON解析]', providerInfo, '标准格式解析成功，解析到', parsed.translations.length, '个结果');
      return results;
    }
    
    // 格式2：错误的单数形式 {"translation": [...]} 
    if (parsed.translation && Array.isArray(parsed.translation)) {
      console.warn('[JSON解析]', providerInfo, '检测到错误的单数形式translation，尝试解析');
      const results: string[] = new Array(expectedCount).fill('');
      
      parsed.translation.forEach((item: any) => {
        if (item.index && item.text !== undefined && item.text !== null) {
          const index = parseInt(item.index) - 1;
          if (index >= 0 && index < expectedCount) {
            results[index] = typeof item.text === 'string' ? item.text : String(item.text);
          }
        } else if (Array.isArray(item) && item.length >= 2) {
          const index = parseInt(item[0]) - 1;
          if (index >= 0 && index < expectedCount) {
            results[index] = typeof item[1] === 'string' ? item[1] : String(item[1]);
          }
        }
      });
      
      console.log('[JSON解析]', providerInfo, '单数格式解析成功，解析到', parsed.translation.length, '个结果');
      return results;
    }
    
    // 格式3：错误的字符串格式 {"translation": "所有翻译作为一个字符串"}
    if (parsed.translation && typeof parsed.translation === 'string') {
      console.warn('[JSON解析]', providerInfo, '检测到translation是字符串，尝试从字符串中提取');
      // 降级到文本解析
      result = parsed.translation;
    }
  } catch (e) {
    const error = e as Error;
    console.warn('[JSON解析]', providerInfo, 'JSON解析失败，尝试文本格式:', error.message);
    console.warn('[JSON解析]', providerInfo, '失败原因详情:', error);
    console.warn('[JSON解析]', providerInfo, '原始内容前500字符:', result.substring(0, 500));
  }
  
  // 回退1：尝试按序号分割 - 匹配行首的 [数字]
  const results: string[] = [];
  const pattern = /^\[(\d+)\]\s*([\s\S]*?)(?=\n\s*\[\d+\]|\s*$)/gm;
  let match;
  
  while ((match = pattern.exec(result)) !== null) {
    const index = parseInt(match[1]) - 1;
    let text = match[2].trim();
    text = text.replace(/^\[\d+\]\s*/, '');
    results[index] = text;
  }
  
  console.log('[JSON解析]', providerInfo, '按序号解析到', results.length, '个结果');
  if (results.length > 0) {
    console.log('[JSON解析]', providerInfo, '前3个解析结果:');
    results.slice(0, 3).forEach((text, idx) => {
      console.log(`  [${idx}] 长度: ${text?.length || 0}, 内容: ${text?.substring(0, 100) || '(空)'}...`);
    });
  }
  
  // 如果仍然解析失败，尝试按空行分割
  if (results.length !== expectedCount) {
    console.warn('[JSON解析]', providerInfo, '按序号解析失败，尝试按空行分割');
    let parts = result.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    parts = parts.map(part => part.replace(/^\[\d+\]\s*/, ''));
    console.log('[JSON解析]', providerInfo, '按空行解析到', parts.length, '个结果');
    return parts.slice(0, expectedCount);
  }
  
  return results;
}
