# SF-007 NHTSA Golden Dataset

This repository-owned corpus is complete: **36 class folders, 108 cases, 72
Vietnamese prompts, and 36 English prompts**. Each NHTSA scenario class has
one `class.md` and exactly one JSONL record for each lens: `canonical`,
`paraphrase`, and `incomplete`.

V1 is exactly 36 folders and 108 cases; all records are committed corpus data
and no fake cases are used.

The three lenses are canonical, paraphrase, and incomplete.

The deterministic validator reports **0 issues** for the committed corpus.
The dataset evaluates offline structured interpretation, clarification,
grounding, and closed semantic compilation. Its scope ends at the
**pre-Scenic boundary**: it stops before Build, Scenic, CARLA, approval, and
runtime evaluation.

The committed schema is generated from `GoldenCase`; source provenance is in
[`sources/SOURCE.md`](sources/SOURCE.md). The class documents record the
NHTSA original name, Vietnamese name, faithful DOT definition, nearby-class
distinction, current Scenario Forge semantic disposition, case IDs, and
review/provenance status.

Run from the repository root:

```bash
python3 scripts/validate_agent_golden_dataset.py --root golden_dataset
```
