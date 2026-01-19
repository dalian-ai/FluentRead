/**
 * 测试节点过滤和分类逻辑
 * 验证 data-fr-node-id 和 data-fr-skip-node 的正确分配
 * 
 * 注意: 这个测试直接测试分类逻辑，不依赖完整的 config 系统
 */

// 模拟 isValidText 函数的逻辑（基于 check.ts）
function isValidText(text: string): boolean {
  // 去除首尾空白
  const trimmed = text.trim();
  
  // 空字符串不需要翻译
  if (!trimmed.length) return false;
  
  // 太短的文本（< 2字符）不翻译
  if (trimmed.length < 2) return false;
  
  // 纯数字不翻译
  if (/^\d+$/.test(trimmed)) return false;
  
  // 纯符号或特殊字符不翻译
  if (/^[\s\p{P}\p{S}]+$/u.test(trimmed)) return false;
  
  // 其他情况需要翻译
  return true;
}

/**
 * 对节点进行分类，判断是否需要翻译
 */
function classifyNode(text: string, counter: number) {
  const needsTranslation = isValidText(text);
  
  const nodeId = needsTranslation 
    ? `fr-node-${counter}`
    : `fr-skip-${counter}`;
  
  return {
    needsTranslation,
    nodeId,
    text
  };
}

const testCases = [
  // 需要翻译的文本
  {
    name: '普通英文文本',
    text: 'This is a long paragraph that needs translation.',
    expectedTranslation: true
  },
  {
    name: '多句英文',
    text: 'Hello world. This is a test.',
    expectedTranslation: true
  },
  {
    name: '中文文本',
    text: '这是一段需要翻译的中文文本。',
    expectedTranslation: true
  },
  // 不需要翻译的文本
  {
    name: '年份数字',
    text: '1994',
    expectedTranslation: false
  },
  {
    name: '单个字母',
    text: 'a',
    expectedTranslation: false
  },
  {
    name: '空字符串',
    text: '',
    expectedTranslation: false
  },
  {
    name: '纯空白',
    text: '   ',
    expectedTranslation: false
  },
  {
    name: '纯数字',
    text: '12345',
    expectedTranslation: false
  },
  {
    name: '特殊符号',
    text: '!!!',
    expectedTranslation: false
  }
];

console.log('=== 测试节点分类逻辑 ===\n');

let passedCount = 0;
let failedCount = 0;

testCases.forEach((testCase, index) => {
  const classification = classifyNode(testCase.text, index);
  
  const actualTranslation = classification.needsTranslation;
  const expectedTranslation = testCase.expectedTranslation;
  const isCorrect = actualTranslation === expectedTranslation;
  
  if (isCorrect) {
    passedCount++;
    const nodeIdPrefix = actualTranslation ? 'fr-node' : 'fr-skip';
    console.log(`✅ ${testCase.name}`);
    console.log(`   节点 ID: ${classification.nodeId} (${nodeIdPrefix})`);
    console.log(`   文本: "${testCase.text}"\n`);
  } else {
    failedCount++;
    console.log(`❌ ${testCase.name}`);
    console.log(`   期望: ${expectedTranslation ? '需要翻译' : '跳过翻译'}`);
    console.log(`   实际: ${actualTranslation ? '需要翻译' : '跳过翻译'}`);
    console.log(`   节点 ID: ${classification.nodeId}`);
    console.log(`   文本: "${testCase.text}"\n`);
  }
});

console.log('\n=== 测试结果 ===');
console.log(`✅ 通过: ${passedCount}/${testCases.length}`);
console.log(`❌ 失败: ${failedCount}/${testCases.length}`);

if (failedCount === 0) {
  console.log('\n🎉 所有测试通过！');
} else {
  console.log(`\n⚠️  有 ${failedCount} 个测试失败`);
}
