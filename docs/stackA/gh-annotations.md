# GitHub Annotations Playbook for Stack A Smoke

## Workflow Commands

The smoke workflow emits workflow commands for key results:

```bash
::add-matcher::ci/matchers/smoke.json
::notice::Stack A smoke suite passed on this matrix lane
::error::<component> failed — <detail>
::warning::Failed to publish check-run (status): <body>
```

Register the matcher as soon as the job starts to parse `SMOKE RESULT` lines produced by `npm run test:smoke`.

## Problem Matcher Schema

`ci/matchers/smoke.json`:

```json
{
  "problemMatcher": [
    {
      "owner": "stacka-smoke",
      "pattern": [
        {
          "regexp": "^SMOKE RESULT component=(?<component>[^\\s]+) status=(?<status>fail) duration_ms=(?<duration>\\d+) detail=(?<message>.+)$",
          "message": 4,
          "severity": "error"
        }
      ]
    }
  ]
}
```

## Checks API Payload

`collect-smoke-summary.mjs` posts the following request to the Checks API (values shortened for readability):

```json
{
  "name": "Stack A smoke",
  "head_sha": "${GITHUB_SHA}",
  "status": "completed",
  "conclusion": "success",
  "output": {
    "title": "Stack A smoke diagnostics",
    "summary": "### Stack A Smoke Summary\n| Component | Status | Duration (s) | Detail |\n...",
    "annotations": [
      {
        "path": "apps/orchestrator/tests/smoke.spec.ts",
        "start_line": 120,
        "end_line": 120,
        "annotation_level": "failure",
        "message": "milvus-vector — Smoke failures: ..."
      }
    ]
  }
}
```

Update the `head_sha`, conclusion, and annotations dynamically depending on matrix results. The summary table doubles as the job summary appended to `$GITHUB_STEP_SUMMARY`.
