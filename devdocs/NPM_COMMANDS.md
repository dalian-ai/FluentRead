# NPM Commands

## Available Commands

### `npm run dev`
Start development server with hot reload.

### `npm run dev:firefox`
Start development server for Firefox.

### `npm run test` ⭐ **NEW**
Run all test suites. Includes:
- Response parser tests (17 test cases)
- Response parser model-specific tests (Nemotron, GLM, repair)
- Node filter classification tests (9 test cases)
- Total: 5 test suites, 26+ test cases

**Usage:**
```bash
npm run test
```

**Example Output:**
```
🧪 开始运行测试套件...

▶️  运行: test-response-parser.ts
========================================
  测试结果汇总
========================================
总计: 17 个测试
通过: 17
所有测试通过! 🎉

[... more test suites ...]

=== 测试汇总 ===
✅ test-response-parser.ts
✅ test-response-parser-nemotron.ts
✅ test-response-parser-repair.ts
✅ test-response-parser-glm.ts
✅ test-node-filter.ts

总计: 5 通过, 0 失败
```

### `npm run build` ⭐ **UPDATED**
Build the extension. **Tests run before building** - if tests fail, the build will fail.

**Process:**
1. Run all tests via `npm run test`
2. If tests pass → proceed to build
3. If tests fail → build fails and stops

**Usage:**
```bash
npm run build
```

**Example Output (when tests pass):**
```
> npm run test && wxt build

> npm run test
[... all tests pass ...]

WXT 0.20.13
ℹ Building chrome-mv3 for production with Vite 5.4.21
✔ Built extension in 7.6 s
```

### `npm run build:firefox`
Build for Firefox. **Tests run before building** - if tests fail, the build will fail.

### `npm run zip`
Create a distributable zip file from the built extension.

### `npm run zip:firefox`
Create a distributable zip file for Firefox.

### `npm run compile`
Type-check Vue components without emitting files. Useful for catching TypeScript errors.

### `npm run docs:dev`
Start documentation server with hot reload.

### `npm run docs:build`
Build documentation to static HTML.

### `npm run docs:preview`
Preview built documentation locally.

## Build Quality Gates

The build now includes automatic quality checks:

✅ **Test Suite Execution** (before build)
- All 5 test suites must pass
- 26+ test cases validation
- Tests for response parsing, model compatibility, and DOM manipulation
- If any test fails, build is stopped

This ensures that only code that passes all tests gets built into the extension.

## Testing Workflow

### During Development
```bash
# Run tests frequently
npm run test

# Build only when tests pass
npm run build
```

### In CI/CD Pipeline
```bash
# One command runs tests + builds on success
npm run build
```

If any test fails, the process exits with error code 1 and build does not proceed.
