/**
 * 节点过滤和分类工具
 * 用于区分需要翻译的节点和需要跳过的节点
 */

import { isValidText } from './check';

export interface NodeClassification {
  needsTranslation: boolean;
  nodeId: string;  // fr-node-X 或 fr-skip-X
  text: string;
  tagName: string;
}

/**
 * 对节点进行分类，判断是否需要翻译
 * @param node - DOM 元素
 * @param counter - 节点计数器
 * @returns 节点分类信息
 */
export function classifyNode(node: Element, counter: number): NodeClassification {
  const text = node.textContent || '';
  const tagName = node.tagName?.toLowerCase() || 'unknown';
  const needsTranslation = isValidText(text);
  
  const nodeId = needsTranslation 
    ? `fr-node-${counter}`
    : `fr-skip-${counter}`;
  
  return {
    needsTranslation,
    nodeId,
    text,
    tagName
  };
}

/**
 * 检查文本是否有效（用于测试）
 * @param text - 要检查的文本
 * @returns 是否有效
 */
export function isTextValid(text: string): boolean {
  return isValidText(text);
}

/**
 * 批量对节点进行分类
 * @param nodes - DOM 元素数组
 * @returns 分类结果数组
 */
export function classifyNodes(nodes: Element[]): NodeClassification[] {
  return nodes.map((node, index) => classifyNode(node, index));
}
