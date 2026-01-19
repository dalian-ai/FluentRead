/**
 * responseParser.ts 的测试用例
 * 测试各种 API 响应格式的解析能力
 */

import { 
  parseApiResponse,
  parseFullApiResponse,
  cleanJsonString, 
  extractContent,
  repairTruncatedJson,
  extractByRegex
} from '../entrypoints/utils/responseParser';

// 终端颜色输出
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`
};

interface TestCase {
  name: string;
  input: string | object;
  expectedSuccess: boolean;
  expectedCount?: number; // 期望的翻译数量
  description?: string;
}

const testCases: TestCase[] = [
  {
    name: "标准 JSON 格式",
    input: JSON.stringify({
      translations: [
        { index: 0, text: "你好世界" },
        { index: 1, text: "测试文本" }
      ]
    }),
    expectedSuccess: true,
    expectedCount: 2,
    description: "最标准的返回格式"
  },
  
  {
    name: "带 Markdown 代码块",
    input: '```json\n{"translations":[{"index":0,"text":"翻译1"},{"index":1,"text":"翻译2"}]}\n```',
    expectedSuccess: true,
    expectedCount: 2,
    description: "AI 返回时包含代码块标记"
  },
  
  {
    name: "带序号标记的翻译",
    input: JSON.stringify({
      translations: [
        { index: 0, text: "[1] 这是第一段" },
        { index: 1, text: "[2] 这是第二段" }
      ]
    }),
    expectedSuccess: true,
    expectedCount: 2,
    description: "AI 错误地在翻译中添加了序号，应该被移除"
  },
  
  {
    name: "前后有额外文本",
    input: 'Here is the translation result:\n\n{"translations":[{"index":0,"text":"结果"}]}\n\nDone!',
    expectedSuccess: true,
    expectedCount: 1,
    description: "AI 添加了额外说明文字"
  },
  
  {
    name: "嵌套格式（用户提供的实际案例）",
    input: `
{
  "translations": [
    {"index": 0, "text": "古希腊历史学家希罗多德"},
    {"index": 1, "text": "（约公元前484-425年）"}
  ]
}
`,
    expectedSuccess: true,
    expectedCount: 2,
    description: "带换行和缩进的格式"
  },
  
  {
    name: "对象格式（非字符串）",
    input: {
      translations: [
        { index: 0, text: "直接对象" },
        { index: 1, text: "不需要解析" }
      ]
    },
    expectedSuccess: true,
    expectedCount: 2,
    description: "已经是 JavaScript 对象"
  },
  
  {
    name: "截断的 JSON（轻微截断，自动修复）",
    input: '{"translations":[{"index":0,"text":"完整的"},{"index":1,"text":"不完',
    expectedSuccess: true,
    expectedCount: 1,
    description: "响应被截断，但 repairTruncatedJson 会尝试恢复"
  },
  
  {
    name: "截断的 JSON（只缺少结尾括号，可修复）",
    input: '{"translations":[{"index":0,"text":"完整的"},{"index":1,"text":"也是完整的"}',
    expectedSuccess: true,
    expectedCount: 2,
    description: "只缺少结尾括号，repairTruncatedJson 可以自动补齐"
  },
  
  {
    name: "使用正则回退的格式",
    input: `翻译结果如下：
[0] 第一段翻译
[1] 第二段翻译
[2] 第三段翻译`,
    expectedSuccess: true,
    expectedCount: 3,
    description: "非 JSON 格式，使用正则表达式提取"
  },
  
  {
    name: "空翻译数组",
    input: JSON.stringify({ translations: [] }),
    expectedSuccess: true,
    expectedCount: 0,
    description: "合法但为空"
  },
  
  {
    name: "缺少 translations 字段",
    input: JSON.stringify({ result: "something else" }),
    expectedSuccess: false,
    description: "不符合 schema"
  },
  
  {
    name: "完全无效的内容",
    input: "这只是一段普通文本，没有任何翻译信息",
    expectedSuccess: false,
    description: "无法提取任何翻译"
  },
  
  {
    name: "格式错误的 JSON",
    input: '{"translations": [{"index": 0, "text": "缺少引号}]}',
    expectedSuccess: false,
    description: "语法错误的 JSON"
  },
  
  {
    name: "多余的逗号（自动修复）",
    input: '{"translations":[{"index":0,"text":"文本"},]}',
    expectedSuccess: true,
    expectedCount: 1,
    description: "JSON 包含尾随逗号，repairTruncatedJson 会自动修复"
  },
  
  {
    name: "用户真实案例 - 17条翻译",
    input: `
{
  "translations": [
    {"index": 0, "text": "古希腊历史学家希罗多德（约公元前484-425年）常被誉为\\"历史之父\\"。"},
    {"index": 1, "text": "他最著名的作品《历史》（Histories）是对希腊-波斯战争的详细叙述，同时也探讨了导致这场冲突的原因和文化背景。"},
    {"index": 2, "text": "希罗多德采用的研究方法——基于询问和系统调查——在历史写作中具有革命性意义。"},
    {"index": 3, "text": "他广泛游历地中海世界，收集故事、神话和第一手资料。"},
    {"index": 4, "text": "虽然他的作品中夹杂着神话和奇闻轶事，但这反映了他对人类经验多样性的更广泛兴趣。"},
    {"index": 5, "text": "希罗多德的《历史》不仅仅是一部战争编年史；它也是对古代世界各民族习俗、地理和文化的详细探索。"},
    {"index": 6, "text": "他对埃及、斯基泰亚和波斯等地的描述，为我们了解古代文明提供了宝贵的见解。"},
    {"index": 7, "text": "他的叙述风格——通过生动的故事和丰富的细节吸引读者——使历史变得既易懂又引人入胜。"},
    {"index": 8, "text": "尽管他在叙述中偶有偏见和不准确之处，但希罗多德对历史的贡献是不可估量的。"},
    {"index": 9, "text": "他确立了历史研究作为一门学科的基础，强调了基于证据的探究和批判性思维的重要性。"},
    {"index": 10, "text": "今天，学者们继续研究希罗多德的作品，以更好地理解古代世界以及历史叙述在塑造我们对过去理解中的作用。"},
    {"index": 11, "text": "他留下的遗产提醒我们，历史不仅仅是一系列事件，而是人类经验的复杂而多面的探索。"},
    {"index": 12, "text": "通过他的工作，希罗多德不仅记录了他那个时代的事件，还为未来几代人保存了古代世界的文化和知识财富。"},
    {"index": 13, "text": "他对多元文化主义和人类差异的关注在当今的全球化世界中仍然具有现实意义。"},
    {"index": 14, "text": "希罗多德的《历史》证明了讲故事在保存和传播人类知识方面的持久力量。"},
    {"index": 15, "text": "作为\\"历史之父\\"，希罗多德的影响超越了学术界，激励着对过去及其对现在影响的持续探索。"},
    {"index": 16, "text": "他的作品仍然是任何对历史、文化和人类状况感兴趣的人必读的著作。"}
  ]
}`,
    expectedSuccess: true,
    expectedCount: 17,
    description: "用户反馈的实际失败案例（修正了JSON中的中文引号）"
  },
  
  {
    name: "带 reasoning 字段的响应（推理模型）",
    input: JSON.stringify({
      translations: [
        { index: 0, text: "Stratechery Plus" },
        { index: 1, text: "更新" }
      ]
    }),
    expectedSuccess: true,
    expectedCount: 2,
    description: "推理模型（如 GLM-4.5、OpenAI o1）会返回 reasoning 字段，应该被忽略"
  },
  
  {
    name: "完整 API 响应（带 reasoning）",
    input: {
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            translations: [
              { index: 0, text: "测试翻译1" },
              { index: 1, text: "测试翻译2" }
            ]
          }),
          reasoning: "这是推理过程，应该被忽略",
          reasoning_details: [{ type: "reasoning.text", text: "详细推理" }]
        },
        finish_reason: "stop"
      }]
    },
    expectedSuccess: true,
    expectedCount: 2,
    description: "完整的 API 响应对象，包含 reasoning 字段（应该被忽略）"
  }
];

// 运行单个测试
function runTest(testCase: TestCase, index: number): boolean {
  console.log(`\n${colors.cyan(`测试 ${index + 1}/${testCases.length}`)}: ${testCase.name}`);
  if (testCase.description) {
    console.log(colors.gray(`  说明: ${testCase.description}`));
  }
  
  // 判断是否是完整的 API 响应对象（包含 choices 结构）
  const isFullApiResponse = typeof testCase.input === 'object' && 
                            'choices' in testCase.input;
  
  // 根据输入类型选择合适的解析函数
  const result = isFullApiResponse 
    ? parseFullApiResponse(testCase.input, `test-${index}`)
    : parseApiResponse(testCase.input, `test-${index}`);
  
  // 验证成功/失败状态
  const statusMatch = result.success === testCase.expectedSuccess;
  if (!statusMatch) {
    console.log(colors.red(`  ✗ 状态不匹配: 期望 ${testCase.expectedSuccess}, 实际 ${result.success}`));
    if (result.error) {
      console.log(colors.gray(`    错误: ${result.error}`));
    }
    return false;
  }
  
  // 如果期望成功，验证翻译数量
  if (testCase.expectedSuccess && testCase.expectedCount !== undefined) {
    const actualCount = result.data?.translations.length || 0;
    if (actualCount !== testCase.expectedCount) {
      console.log(colors.red(`  ✗ 数量不匹配: 期望 ${testCase.expectedCount}, 实际 ${actualCount}`));
      return false;
    }
  }
  
  // 显示解析方法
  if (result.debugInfo?.parseMethod) {
    console.log(colors.gray(`  解析方法: ${result.debugInfo.parseMethod}`));
  }
  
  // 如果成功，显示第一条翻译
  if (result.success && result.data && result.data.translations.length > 0) {
    const first = result.data.translations[0];
    const preview = first.text.length > 50 ? first.text.substring(0, 50) + '...' : first.text;
    console.log(colors.gray(`  示例: [${first.index}] ${preview}`));
  }
  
  console.log(colors.green(`  ✓ 通过`));
  return true;
}

// 运行所有测试
function runAllTests() {
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('  Response Parser 测试套件'));
  console.log(colors.cyan('========================================'));
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    if (runTest(testCase, index)) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('  测试结果汇总'));
  console.log(colors.cyan('========================================'));
  console.log(`总计: ${testCases.length} 个测试`);
  console.log(colors.green(`通过: ${passed}`));
  if (failed > 0) {
    console.log(colors.red(`失败: ${failed}`));
  } else {
    console.log(colors.green('所有测试通过! 🎉'));
  }
  
  return failed === 0;
}

// 单独测试清理函数
function testCleanJsonString() {
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('  cleanJsonString 单独测试'));
  console.log(colors.cyan('========================================'));
  
  const cases = [
    { input: '```json\n{"key":"value"}\n```', expected: '{"key":"value"}' },
    { input: '   {"key":"value"}   ', expected: '{"key":"value"}' },
    { input: 'prefix {"key":"value"} suffix', expected: '{"key":"value"}' }
  ];
  
  cases.forEach((c, i) => {
    const result = cleanJsonString(c.input);
    const pass = result === c.expected;
    console.log(`${pass ? colors.green('✓') : colors.red('✗')} 案例 ${i + 1}: ${pass ? '通过' : '失败'}`);
    if (!pass) {
      console.log(colors.gray(`  输入: ${c.input}`));
      console.log(colors.gray(`  期望: ${c.expected}`));
      console.log(colors.gray(`  实际: ${result}`));
    }
  });
}

// 主执行函数
async function main() {
  testCleanJsonString();
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}

// 直接执行
main();

export { runAllTests, testCleanJsonString };
