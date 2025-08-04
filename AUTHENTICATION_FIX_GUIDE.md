# LangGraph Authentication Fix - Turborepo Monorepo Issue

## Problem Statement

After converting the ritagraph project to a Turborepo monorepo structure, LangGraph authentication stopped working. The auth handler was never being triggered, resulting in the error:

```
Error: Authentication failed: No user found in config
langgraph_auth_user is missing from config.configurable
```

## Root Cause Analysis

### The Core Issue
LangGraph uses **module-level discovery** to link authentication instances to graphs. When `langgraph.json` specifies:
```json
{
  "graphs": {
    "rita": "./apps/rita/src/graphs/rita/graph.ts:graph"
  },
  "auth": {
    "path": "apps/rita/src/security/auth.ts:auth"
  }
}
```

LangGraph expects the `auth` instance and `graph` export to be **discoverable in the same execution context** when the graph module is loaded.

### What Broke During Monorepo Conversion
- **Before**: Auth and graph were in the same codebase/context
- **After**: Auth instance was created in `apps/rita/src/security/auth.ts` but graph was created via factory pattern in `packages/rita-graphs/src/graphs/rita/graph.ts`
- **Result**: When LangGraph loaded the graph module, it couldn't discover the auth instance because they were in different execution contexts

### Why Factory Pattern Wasn't the Issue
The factory pattern worked correctly - it allowed sharing graph logic across the monorepo while maintaining app-specific auth. The issue was that the final graph export wasn't in the same module scope as the auth instance.

## Test Steps Performed

### 1. Testing Without Authorization Headers (LangGraph Studio)
```bash
# Start dev server
cd apps/rita && npm run dev

# Test via LangGraph Studio
# Result: Auth handler never called, no langgraph_auth_user in config
```

### 2. Testing With Authorization Headers (Direct API)
```bash
# Test with proper Authorization header
curl -X POST http://localhost:2024/threads \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json"

curl -X POST http://localhost:2024/threads/{id}/runs \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"assistant_id": "...", "input": {"messages": [...]}}'

# Result: Auth handler still never called
```

### 3. Backend Integration Test
When the backend sent requests with proper JWT tokens and headers, auth handler was triggered and `langgraph_auth_user` appeared in config, confirming the fix worked end-to-end.

## The Solution

### Core Fix: Same Module Scope Export
The minimal solution is to ensure both `auth` and `graph` are exported from the same module that LangGraph loads.

**File: `apps/rita/src/graphs/rita/graph.ts`**
```typescript
import { createRitaGraph } from '@the-project-b/rita-graphs';
import { getAuthUser, auth } from '../../security/auth.js';

// Create graph using factory pattern
export const graph = createRitaGraph(getAuthUser, auth)();

// CRITICAL: Export auth from same module so LangGraph can discover it
export { auth };
```

### Supporting Changes Required

1. **Fix LangGraph SDK Version Mismatch**
   - Problem: Different packages had different versions (0.0.84 vs 0.0.105)
   - Solution: Centralize in root `package.json`

2. **Update Factory Function Signature**
   ```typescript
   // packages/rita-graphs/src/graphs/rita/graph.ts
   export function createRitaGraph(getAuthUser: GetAuthUserFunction, authInstance?: Auth) {
     // ...existing implementation
   }
   ```

3. **Fix TypeScript Header Types**
   ```typescript
   // Fix Headers.get() returning string|null vs string|undefined
   authorization = request.headers.get("authorization") || undefined;
   ```

## Changes Made vs Actually Needed

### ✅ ESSENTIAL Changes (Keep These)
1. **Same module export** in `apps/rita/src/graphs/rita/graph.ts`
2. **Centralized dependency management** in root `package.json`
3. **TypeScript header fix** for `string | null` vs `string | undefined`

### ❌ UNNECESSARY Changes (Can Be Reverted)
1. **Auth instance passing** to factory function - the `authInstance?: Auth` parameter
2. **Graph linking logic** in factory (`🔗 Linking auth instance to graph`)
3. **Debug logging** (`📍 Graph module`, `🔗 Linking auth instance`)
4. **Complex auth instance attachment** to graph object

### 📦 BENEFICIAL But Not Required (Keep for Best Practices)
1. **Factory pattern** - Enables code sharing while maintaining app-specific auth
2. **Centralized dependencies** - Prevents future version conflicts
3. **Shared auth utilities** - Good monorepo architecture

## Implementation Steps

### Step 1: Centralize Dependencies (Recommended)
```json
// package.json (root)
{
  "dependencies": {
    "@langchain/langgraph": "^0.3.12",
    "@langchain/langgraph-cli": "^0.0.56", 
    "@langchain/langgraph-sdk": "^0.0.105"
  }
}
```

Remove these dependencies from individual package.json files.

### Step 2: Minimal Core Fix
**File: `apps/rita/src/graphs/rita/graph.ts`**
```typescript
import { createRitaGraph } from '@the-project-b/rita-graphs';
import { getAuthUser, auth } from '../../security/auth.js';

export const graph = createRitaGraph(getAuthUser)();
export { auth }; // CRITICAL: This line fixes the issue
```

### Step 3: Fix TypeScript Errors
**File: `apps/rita/src/security/auth.ts`**
```typescript
// In auth handler, fix Headers.get() return type
authorization = request.headers.get("authorization") || undefined;
impersonationContext = request.headers.get("x-impersonation-context") || undefined;
```

### Step 4: Test
```bash
npm install
npm run build
cd apps/rita && npm run dev
```

Test with backend integration to verify `🔐 Auth handler called!` appears in logs.

## Technical Details

### Why This Works
1. **Module Introspection**: LangGraph scans the graph module for exports when loading
2. **Execution Context**: Both auth and graph exist in the same JavaScript realm
3. **Import Resolution**: The auth instance is created when the module is imported
4. **Discovery Pattern**: LangGraph can find the auth instance via the module export

### Key Insight
The issue wasn't about passing auth instances or complex linking - it was about **module-level visibility**. LangGraph's architecture assumes auth and graph are co-located in the module it loads.

## Verification

### Success Indicators
1. **Auth Handler Called**: `🔐 Auth handler called!` in logs
2. **Auth Data Present**: `langgraph_auth_user: { ... }` in config
3. **No Authentication Errors**: Graph executes successfully with user context
4. **TypeScript Builds**: No compilation errors

### If Still Not Working
1. Check `langgraph.json` paths are correct
2. Verify auth instance is exported: `export { auth }`
3. Ensure both imports in same module: `import { auth } from '../../security/auth.js'`
4. Check for TypeScript compilation errors

## Conclusion

The authentication issue was solved by ensuring LangGraph could discover the auth instance in the same module scope as the graph export. This required only a single line addition (`export { auth };`) but took extensive investigation to understand LangGraph's module discovery pattern.

The factory pattern and monorepo architecture work perfectly - we just needed to respect LangGraph's expectation that auth and graph be co-located at the module level.