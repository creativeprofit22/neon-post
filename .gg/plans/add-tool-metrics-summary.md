# Add Tool Metrics Summary

## Goal
Add a `getToolMetricsSummary()` function to `src/tools/diagnostics.ts` that tracks cumulative tool call stats (total calls, avg duration, error rate per tool) — useful for debugging and performance monitoring.

## Changes

### File: `src/tools/diagnostics.ts`

1. **Add a `toolMetrics` Map** (after line 23, near `activeTools`):
   ```ts
   interface ToolMetrics {
     totalCalls: number;
     totalDuration: number;
     errors: number;
     timeouts: number;
   }
   const toolMetrics = new Map<string, ToolMetrics>();
   ```

2. **Record metrics in `wrapToolHandler`** — in the `try` block (after line 91, on success) and `catch` block (after line 105, on failure), update `toolMetrics` for the tool:
   - Increment `totalCalls`
   - Add to `totalDuration`
   - On error: increment `errors`; on timeout: increment `timeouts`

3. **Export `getToolMetricsSummary()`** (after `logActiveToolsStatus`, ~line 141):
   ```ts
   export function getToolMetricsSummary(): Record<string, { totalCalls: number; avgDuration: number; errorRate: number; timeouts: number }> {
     const summary: Record<string, { totalCalls: number; avgDuration: number; errorRate: number; timeouts: number }> = {};
     for (const [name, m] of toolMetrics) {
       summary[name] = {
         totalCalls: m.totalCalls,
         avgDuration: m.totalCalls > 0 ? Math.round(m.totalDuration / m.totalCalls) : 0,
         errorRate: m.totalCalls > 0 ? Math.round((m.errors / m.totalCalls) * 100) : 0,
         timeouts: m.timeouts,
       };
     }
     return summary;
   }
   ```

4. **Export `resetToolMetrics()`** for testing:
   ```ts
   export function resetToolMetrics(): void {
     toolMetrics.clear();
   }
   ```

## Verification
```bash
npm run typecheck && npm run lint
```

## Risk
None — purely additive, no existing behavior changes.
