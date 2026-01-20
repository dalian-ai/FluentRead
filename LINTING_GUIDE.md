# Web Extension Linting Guide

## Overview

The project now includes npm scripts for linting and validating the extension using Mozilla's `web-ext` tool.

## Available Commands

### `npm run lint`
Comprehensive lint check for both Chrome and Firefox versions:
- Builds the extension first
- Lints Chrome (Manifest V3) version
- Lints Firefox (Manifest V2) version

**Usage:**
```bash
npm run lint
```

### `npm run lint:chrome`
Lint only the Chrome extension (Manifest V3):

**Usage:**
```bash
npm run lint:chrome
```

### `npm run lint:firefox`
Lint only the Firefox extension (Manifest V2):

**Usage:**
```bash
npm run lint:firefox
```

## Current Lint Results

### Chrome Extension (MV3)

**Summary:**
- Errors: 2
- Warnings: 8
- Notices: 0

**Critical Issues:**

1. **MANIFEST_FIELD_UNSUPPORTED** - `/background/service_worker` not supported
   - This is expected for Firefox compatibility warnings
   - Chrome MV3 uses service workers, Firefox MV2 does not

2. **ADDON_ID_REQUIRED** - Add-on ID required in Manifest Version 3
   - Firefox requirement - not applicable to Chrome
   - Can be safely ignored for Chrome builds

**Warnings - Code Quality Issues:**

1. **UNSAFE_VAR_ASSIGNMENT** (Multiple instances)
   - Issue: Dynamic assignment to `innerHTML` without sanitization
   - Severity: Security/Performance
   - Recommendation: Review and sanitize all innerHTML assignments
   - Files: content-scripts, popup

2. **KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION**
   - Issue: `strict_min_version` compatibility
   - Recommendation: Update Firefox Android minimum version if needed

3. **DANGEROUS_EVAL**
   - Issue: Use of `Function` constructor or `eval`
   - Severity: Security vulnerability
   - Recommendation: Replace with safer alternatives

## How to Fix Issues

### 1. UNSAFE_VAR_ASSIGNMENT

**Current (Unsafe):**
```javascript
element.innerHTML = userInput;
```

**Fixed (Safe):**
```javascript
element.textContent = userInput;
// OR
const div = document.createElement('div');
div.textContent = userInput;
element.appendChild(div);
```

### 2. DANGEROUS_EVAL

**Current (Unsafe):**
```javascript
const fn = new Function('return ' + expression);
result = fn();
```

**Fixed (Safe):**
```javascript
// Use JSON.parse for JSON data
result = JSON.parse(jsonString);

// Use a proper parser library for other formats
// Or avoid dynamic code generation entirely
```

## Firefox-Specific Issues

The following errors/warnings apply to Firefox compatibility and can be ignored for Chrome-only deployment:

- `ADDON_ID_REQUIRED` - Only required for Firefox
- `MANIFEST_FIELD_UNSUPPORTED` - Chrome MV3 features not in MV2
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` - Firefox mobile only

## Next Steps

### Priority 1 (Security Issues)
- [ ] Fix `DANGEROUS_EVAL` - Replace with safer alternatives
- [ ] Audit and fix all `UNSAFE_VAR_ASSIGNMENT` issues

### Priority 2 (Compatibility)
- [ ] Review Firefox-specific warnings
- [ ] Consider adjusting minimum Firefox version if needed

### Priority 3 (Best Practices)
- [ ] Add security-focused code review process
- [ ] Consider using a Content Security Policy (CSP)
- [ ] Automated linting in CI/CD pipeline

## Integration with Build Process

The lint scripts are integrated with the build process:

```bash
npm run lint       # Builds + lints both versions
npm run build      # Builds with tests first
npm run build:firefox # Builds Firefox version with tests
```

## CI/CD Integration

For continuous integration, add to your CI pipeline:

```yaml
- name: Run tests
  run: npm run test

- name: Build extension
  run: npm run build

- name: Lint extension
  run: npm run lint:chrome
```

This ensures all code changes are tested, built, and validated before merging.

## Resources

- [Mozilla web-ext Documentation](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-lint)
- [Firefox Extension Development Guide](https://extensionworkshop.com/documentation/develop/)
- [Content Security Policy (CSP) for Extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy)
- [Secure Coding Practices](https://owasp.org/www-community/attacks/xss/)
