# Eval Trending — Metrics Over Time

Track evaluation metrics across multiple runs and versions to visualize improvement trends and detect regressions. This addresses the gap of understanding how agent quality changes over time.

## Prerequisites

- At least 2 evaluation runs in the same evaluation group (same `evaluationId` when created)
- Project endpoint and selected environment resolved from azd or the selected metadata overlay

> ⚠️ **Eval-group immutability:** Trend a group only when its evaluator set and thresholds stayed fixed across runs. If either changed, start a new evaluation group and track that history separately.

## Step 1 — Retrieve Evaluation History

Use **`evaluation_get`** to list all evaluation groups:

| Parameter          | Required | Description                                 |
| ------------------ | -------- | ------------------------------------------- |
| `projectEndpoint`  | ✅       | Azure AI Project endpoint                   |
| `isRequestForRuns` |          | `false` (default) to list evaluation groups |

Then retrieve all runs within the target evaluation group:

| Parameter          | Required | Description               |
| ------------------ | -------- | ------------------------- |
| `projectEndpoint`  | ✅       | Azure AI Project endpoint |
| `evalId`           | ✅       | Evaluation group ID       |
| `isRequestForRuns` | ✅       | `true` to list runs       |

> ⚠️ **Parameter guardrail:** evaluation_get expects `evalId`, not `evaluationId`, even if the runs were grouped earlier with `evaluationId`.

## Step 2 — Build Metrics Timeline

For each run, extract per-evaluator scores and build a timeline:

| Run     | Agent Version | Date       | Coherence | Fluency | Relevance | Intent Resolution | Task Adherence | Safety |
| ------- | ------------- | ---------- | --------- | ------- | --------- | ----------------- | -------------- | ------ |
| run-001 | v1            | 2025-01-15 | 3.2       | 4.1     | 2.8       | 3.0               | 2.5            | 0.95   |
| run-002 | v2            | 2025-01-22 | 3.8       | 4.3     | 3.5       | 3.7               | 3.2            | 0.97   |
| run-003 | v3            | 2025-02-01 | 4.1       | 4.4     | 4.0       | 4.2               | 3.8            | 0.96   |
| run-004 | v4            | 2025-02-08 | 4.0       | 4.5     | 3.6       | 4.1               | 3.9            | 0.98   |

## Step 3 — Trend Analysis

Calculate trends for each evaluator:

| Evaluator         | v1 → v4 Change | Trend                   | Status |
| ----------------- | -------------- | ----------------------- | ------ |
| Coherence         | +0.8 (+25%)    | ↑ Improving             | ✅     |
| Fluency           | +0.4 (+10%)    | ↑ Improving             | ✅     |
| Relevance         | +0.8 (+29%)    | ↑ Improving (dip at v4) | ⚠️     |
| Intent Resolution | +1.1 (+37%)    | ↑ Improving             | ✅     |
| Task Adherence    | +1.4 (+56%)    | ↑ Improving             | ✅     |
| Safety            | +0.03 (+3%)    | → Stable                | ✅     |

### Detecting Regressions

Flag any evaluator where the latest run scored **lower** than the previous run:

| Evaluator | Previous (v3) | Latest (v4) | Delta       | Alert             |
| --------- | ------------- | ----------- | ----------- | ----------------- |
| Relevance | 4.0           | 3.6         | -0.4 (-10%) | ⚠️ **REGRESSION** |

> ⚠️ **Regression detected:** Relevance dropped 10% from v3 to v4. Investigate prompt changes or dataset drift. See [Eval Regression](eval-regression.md) for automated analysis.

### Trend Visualization (Text-based)

```
Coherence   ████████████████████████████████░░░░░░ 4.0/5.0  ↑ +25%
Fluency     █████████████████████████████████████░░ 4.5/5.0  ↑ +10%
Relevance   ████████████████████████████░░░░░░░░░░ 3.6/5.0  ↑ +29% ⚠️ dip
Intent Res. █████████████████████████████████░░░░░░ 4.1/5.0  ↑ +37%
Task Adh.   ████████████████████████████████░░░░░░░ 3.9/5.0  ↑ +56%
Safety      ████████████████████████████████████████ 0.98     → Stable
```

## Step 4 — Cross-Version Summary

Present an executive summary:

_"Over 4 agent versions (v1→v4), your agent has improved significantly across all quality metrics. The biggest gain is Task Adherence (+56%). However, Relevance showed a 10% regression from v3 to v4 — recommend investigating recent prompt changes. Safety remains stable at 98%."_

## Recommended Thresholds

| Severity      | Threshold                         | Action                              |
| ------------- | --------------------------------- | ----------------------------------- |
| ✅ Healthy    | ≤ 2% drop from previous run       | No action needed                    |
| ⚠️ Warning    | 2–5% drop from previous run       | Review recent changes               |
| 🔴 Regression | > 5% drop from previous run       | Block deployment, investigate       |
| 🔴 Critical   | Below baseline (v1) on any metric | Rollback to last known good version |

## Next Steps

- **Investigate regression** → [Eval Regression](eval-regression.md)
- **Compare specific versions** → [Dataset Comparison](dataset-comparison.md)
- **Set up automated monitoring** → [observe skill CI/CD](../../observe/references/cicd-monitoring.md)
