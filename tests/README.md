# Tests Suite

Comprehensive test suite for FluentRead, organized in a dedicated folder for maintainability and clarity.

## Test Files Overview

### Core Test Suites

#### `test-response-parser.ts` - Response Parsing (17 test cases) ✅
- **Purpose**: Complete validation of API response parsing across all models
- **Coverage**:
  - Standard JSON formats
  - Markdown-wrapped responses (GLM models)
  - Truncated JSON recovery with auto-repair
  - Reasoning field handling (o1, GLM-4.5, Nemotron)
  - Real user case validation (17-translation example)
  - Fallback strategies (direct → repair → regex)
- **Run**: `npx tsx tests/test-response-parser.ts`

#### `test-node-filter.ts` - Node Classification (9 test cases) ✅
- **Purpose**: Validate node classification logic for DOM manipulation
- **Coverage**:
  - Text validation and node categorization
  - Distinguishing translatable vs skippable nodes
  - ID assignment for `data-fr-node-id` and `data-fr-skip-node`
  - Edge cases (pure numbers, symbols, dates, timestamps)
- **Behavior**:
  - ✅ Translatable: Regular text, multi-word content, sufficient length → `data-fr-node-id="fr-node-X"`
  - ❌ Skip: Pure numbers, single chars, timestamps, symbols → `data-fr-skip-node="fr-skip-X"`
- **Run**: `npx tsx tests/test-node-filter.ts`

### Legacy/Specialized Tests

#### `test-response-parser-nemotron.ts`
- **Purpose**: Nemotron-specific response format validation
- **Focus**: Handling of reasoning token overflow and truncated JSON

#### `test-response-parser-glm.ts`
- **Purpose**: GLM-4-flash model response validation
- **Focus**: Markdown code block unwrapping and content extraction

#### `test-response-parser-repair.ts`
- **Purpose**: JSON truncation repair algorithm validation
- **Focus**: Object boundary detection and auto-correction logic

## Test Coverage Summary

| Test File | Cases | Status | Key Features |
|-----------|-------|--------|--------------|
| test-response-parser.ts | 17 | ✅ All Pass | JSON parsing, truncation repair, reasoning handling, real-world cases |
| test-node-filter.ts | 9 | ✅ All Pass | Node classification, ID assignment, edge case handling |
| test-response-parser-nemotron.ts | - | ✅ Reference | Nemotron response patterns |
| test-response-parser-glm.ts | - | ✅ Reference | GLM markdown wrapping |
| test-response-parser-repair.ts | - | ✅ Reference | JSON repair strategies |
| **TOTAL** | **26+** | **✅ Passing** | Complete coverage |

## Running Tests

### Quick Start
```bash
# Run individual test file
npx tsx tests/test-response-parser.ts
npx tsx tests/test-node-filter.ts

# Run all tests
npx tsx tests/run-all-tests.ts
```

### Test Execution Output Example
```bash
$ npx tsx tests/test-response-parser.ts

========================================
  cleanJsonString 单独测试
========================================
✓ 案例 1: 通过
✓ 案例 2: 通过
✓ 案例 3: 通过

========================================
  Response Parser 测试套件
========================================

测试 1/17: 标准 JSON 格式
  解析方法: direct
  ✓ 通过

[... more tests ...]

========================================
  测试结果汇总
========================================
总计: 17 个测试
通过: 17
所有测试通过! 🎉
```

## Test Infrastructure Details

### Testing Framework
- **Runtime**: tsx (TypeScript execution without browser)
- **Dependencies**: None (no browser APIs required)
- **Format**: Standalone test functions with color-coded output

### Design Principles
1. **Independence**: Tests run without browser or extension context
2. **Clarity**: Color-coded output with descriptive test names
3. **Coverage**: Real user cases mixed with edge cases
4. **Maintainability**: Organized by functionality, easy to add new tests

### Adding New Tests

1. Create file `tests/test-<feature>.ts`
2. Import utilities from `entrypoints/utils/`:
   ```typescript
   import { 
     parseApiResponse,
     classifyNode 
   } from '../entrypoints/utils/';
   ```
3. Define test interface and cases
4. Use color helpers for consistent formatting:
   ```typescript
   const colors = {
     green: (text: string) => `\x1b[32m${text}\x1b[0m`,
     red: (text: string) => `\x1b[31m${text}\x1b[0m`,
     // ...
   };
   ```
5. Add to `run-all-tests.ts` execution list

## Test Verification

After each modification to core utilities, verify:
```bash
# Build project
npm run build

# Run full test suite
npx tsx tests/run-all-tests.ts

# Check individual critical paths
npx tsx tests/test-response-parser.ts
npx tsx tests/test-node-filter.ts
```

## Known Test Behaviors

### Response Parser Tests
- **Direct Parse**: Successfully handles standard JSON (most common case)
- **JSON Repair**: Handles truncated JSON by detecting object boundaries
- **Regex Fallback**: Extracts `[index] text` patterns when JSON is invalid
- **Reasoning Fields**: Safely ignores `reasoning`, `reasoning_details` fields

### Node Filter Tests  
- **Text Validation**: Uses `isValidText()` from check.ts
- **Skip Nodes**: Excludes `<time>`, `<span>123</span>`, etc.
- **ID Assignment**: Maintains index for DOM `data-fr-node-result-id` matching

## Debugging Tests

If tests fail:

1. **Check test output** - Color-coded logs show parse method used
2. **Review error messages** - Includes content preview (first 300-500 chars)
3. **Validate input data** - Ensure test case JSON is properly formatted
4. **Check dependencies** - Ensure `entrypoints/utils/` files are accessible
5. **Run build first** - `npm run build` to catch TypeScript errors

## 测试覆盖范围

- ✅ API 响应解析（截断、markdown 包装、reasoning 字段处理）
- ✅ JSON 修复（对象边界、索引修正、自动补全）
- ✅ 节点分类（有效文本判断、ID 分配）
- ✅ 多模型支持（Nemotron、GLM-4、其他）

## 相关的源文件

- `entrypoints/utils/responseParser.ts` - API 响应解析和 JSON 修复
- `entrypoints/utils/nodeFilter.ts` - 节点分类和过滤逻辑
- `entrypoints/utils/batchTranslate.ts` - 批量翻译流程（使用 nodeFilter）
- `entrypoints/utils/check.ts` - 文本有效性检查（`isValidText`）

## 添加新测试

1. 在本目录创建新文件，命名规范: `test-*.ts`
2. 导入所需的工具函数
3. 定义测试用例和预期结果
4. 使用 `console.log` 输出测试结果
5. 将测试添加到 `run-all-tests.ts` 的 tests 数组

示例:
```typescript
import { someFunction } from '../entrypoints/utils/someFile';

const result = someFunction(testInput);
if (result === expectedOutput) {
  console.log('✅ 测试通过');
} else {
  console.log('❌ 测试失败');
}
```
