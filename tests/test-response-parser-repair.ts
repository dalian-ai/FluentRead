/**
 * 测试修复函数单独调试
 */

import { repairTruncatedJson } from '../entrypoints/utils/responseParser';

const truncatedJson = `{
  "translations": [
    {
      "index": 1,
      "text": "技术博客"
    },
    {
      "index": 2,
      "text": "工程"
    },
    {
      "index": 3,
      "text": "数据科学"
    },
    {
      "index": 4,
      "text": "设计"
    },
    {
      "index": 5,
      "text": "产品"
    },
    {
      "index": 6,
      "text": "安全"
    },
    {
      "index": 7,
      "text": "工程"
    },
    {
      "index": 8,
      "text": "数据科学"
    },
    {
      "index": 9,
      "text": "设计"
    },
    {
      "index": 10,
      "text": "产品"
    },
    {
      "index": 11,
      "text": "安全"
    },
    {
      "index": 12,
      "text": "工程"
    },
    {
      "index": 13,
      "text": "从部署松弛到生产现实：BriX 如何以企业级 AI 基础设施弥合差距"
    },
    {
      "index": 14,
      "text": "Sneh Agrawal · Rishi Raj · Kartik Srinivasan · Eddy Lim · Aseem Kumar · Heber Ng 2026年1月16日 | 阅读 19 分钟"
    },
    {
      "index": 15,
      "text": "摘要"
    },
    {
      "index": 16,
      "text": "你为团队打造的 AI 助手曾是一款改变游戏的利器，在笔记本上运行如臂extension。可当你尝试将其全公司部署时，一切便崩塌。"
    },
    {
      "index": 1`;

console.log('测试修复截断的 JSON...\n');

const repaired = repairTruncatedJson(truncatedJson, true);  // 启用调试

if (repaired) {
  console.log('✅ 修复成功！');
  console.log('\n修复后的 JSON:');
  console.log(repaired);
  
  try {
    const parsed = JSON.parse(repaired);
    console.log(`\n✅ JSON 有效，包含 ${parsed.translations.length} 个翻译`);
  } catch (e) {
    console.log('\n❌ 修复后的 JSON 仍然无效:', e);
  }
} else {
  console.log('❌ 修复失败，返回 null');
}
