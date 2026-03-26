# Simple Functionality Test: FactsCache Unit Tests

## Goal
Add a small unit test file for the `FactsCache` helper functions in `src/memory/facts.ts` to verify `createFactsCache()` returns correct defaults.

## What to test
1. `createFactsCache()` returns an object with `contextCache: null`, `contextCacheValid: false`, `embeddingsReady: false`
2. The returned cache object is a fresh instance each time (no shared reference)

## Implementation

### Step 1: Create test file
- **File:** `tests/unit/facts-cache.test.ts`
- Import `createFactsCache` from `../../src/memory/facts`
- Write 2 simple tests:
  - `createFactsCache returns correct defaults` — assert all three fields
  - `createFactsCache returns fresh instances` — call twice, mutate one, assert the other is unchanged

### Step 2: Verify
```bash
npm run test -- tests/unit/facts-cache.test.ts
npm run typecheck
```

## Risks
- None — pure unit test of a simple factory function, no side effects or mocking needed.
