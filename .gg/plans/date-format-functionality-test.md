# Plan: Functionality Test for date-format.ts

## Summary
Create a simple unit test file for `src/utils/date-format.ts` - a utility module currently lacking test coverage.

## Target File
- **Source**: `src/utils/date-format.ts` (59 lines, 3 exported functions)
- **Test**: `tests/unit/date-format.test.ts` (new file)

## Functions to Test

### 1. `formatDateTime(isoString: string | null): string | null`
- **Purpose**: Format ISO date string to human-readable display
- **Test cases**:
  - Returns `null` for null input
  - Returns `null` for empty string
  - Formats valid ISO string correctly (verify contains weekday, month, day, time)
  - Handles ISO string with timezone info

### 2. `formatDuration(ms: number): string`
- **Purpose**: Format milliseconds to compact string (e.g., "30m", "2h", "1d")
- **Test cases**:
  - Less than 60 seconds → returns seconds (e.g., 30000ms → "30s")
  - Less than 1 hour → returns minutes (e.g., 1800000ms → "30m")
  - Less than 1 day → returns hours (e.g., 7200000ms → "2h")
  - 1 day or more → returns days (e.g., 86400000ms → "1d")
  - Edge cases: 59999ms (rounds to 60s), 3599999ms (rounds to 60m)

### 3. `formatScheduleDisplay(job): string`
- **Purpose**: Format schedule objects for display
- **Test cases**:
  - cron type with schedule → "cron: 0 9 * * *"
  - at type with run_at → "at: <formatted date>"
  - every type with interval_ms → "every 30m"
  - Falls back gracefully with missing fields
  - Returns "unknown" when no schedule info available

## Implementation Steps

1. **Create test file**: `tests/unit/date-format.test.ts`
2. **Add test imports**: Import vitest helpers and the 3 functions
3. **Write `formatDateTime` tests**: ~4 test cases
4. **Write `formatDuration` tests**: ~6 test cases
5. **Write `formatScheduleDisplay` tests**: ~6 test cases
6. **Run tests**: `npm run test -- tests/unit/date-format.test.ts`
7. **Verify quality**: `npm run typecheck && npm run lint`

## Estimated Size
~100-120 lines of test code

## Verification Criteria
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Tests cover all 3 exported functions
- [ ] Tests cover edge cases (null, boundary values)
