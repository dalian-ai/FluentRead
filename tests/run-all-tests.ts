/**
 * 测试套件运行脚本
 * 用于运行所有测试
 */

import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const tests = [
  'test-response-parser.ts',
  'test-response-parser-nemotron.ts',
  'test-response-parser-repair.ts',
  'test-response-parser-glm.ts',
  'test-node-filter.ts'
];

async function runTests() {
  console.log('🧪 开始运行测试套件...\n');
  
  const results: { test: string; success: boolean; error?: string }[] = [];
  
  for (const test of tests) {
    try {
      console.log(`▶️  运行: ${test}`);
      const { stdout, stderr } = await execAsync(`npx tsx tests/${test}`);
      
      if (stdout) {
        console.log(stdout);
      }
      if (stderr && !stderr.includes('warning')) {
        console.error(stderr);
      }
      
      results.push({ test, success: true });
      console.log(`✅ ${test} 完成\n`);
    } catch (error: any) {
      console.error(`❌ ${test} 失败`);
      console.error(error.message);
      console.error('');
      
      results.push({ test, success: false, error: error.message });
    }
  }
  
  // 汇总结果
  console.log('\n=== 测试汇总 ===');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
  });
  
  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
