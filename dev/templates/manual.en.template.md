---
title: "{HUMAN_TITLE}"
description: "{HUMAN_DESCRIPTION_80_TO_160_CHARACTERS}"
category: Manual
tags: ["{TAG_1}", "{TAG_2}"]
status: preview
since: "{ENGINE_VERSION}"
last_verified: "{YYYY-MM-DD}"
audience: ["user", "agent"]
related_api: ["{FULLY_QUALIFIED_SYMBOL_KEY}"]
agent_summary: "{HUMAN_WRITTEN_FACTUAL_SUMMARY}"
source_paths: ["{REPOSITORY_EVIDENCE_PATH}"]
---

<!--
HUMAN-AUTHORED MANUAL TEMPLATE

Copy this file to docs/wiki/docs/en/manual/{slug}.md only after a human author
has filled the factual sections. Keep the Chinese counterpart structurally
equivalent. Remove every {PLACEHOLDER} and this comment before publication.
-->

# {HUMAN_TITLE}

{ONE_PARAGRAPH_EXPLAINING_THE_SYSTEM_AND_WHY_A_READER_NEEDS_IT}

## Scope and ownership

<!-- HUMAN: State what this system owns, what it does not own, and its boundary with adjacent systems. -->

{HUMAN_CONTENT}

## Mental model

<!--
HUMAN: Add one diagram only when relationships are clearer than prose.
Allowed kinds: hierarchy, timeline, pipeline, decision.

Example source form (replace every placeholder):

```text
[INX-DIAGRAM:{KIND}:{ACCESSIBLE_HUMAN_LABEL}]
{PLAIN_TEXT_DIAGRAM_THAT_REMAINS_USEFUL_TO_AN_AGENT}
```
-->

{HUMAN_CONTENT_OR_REMOVE_SECTION}

## When to use it

| Use | Avoid | Reason |
|---|---|---|
| {HUMAN_CASE} | {HUMAN_ANTI_PATTERN} | {HUMAN_REASON} |

## Workflow

1. {HUMAN_STEP_WITH_OBSERVABLE_RESULT}
2. {HUMAN_STEP_WITH_OBSERVABLE_RESULT}
3. {HUMAN_STEP_WITH_OBSERVABLE_RESULT}

## API contract and example

<!--
HUMAN: Verify every symbol and signature against the generated API for the
documented release. Keep examples minimal and executable. Do not invent APIs.
-->

{HUMAN_EXPLANATION}

```python
# {HUMAN_VERIFIED_MINIMAL_EXAMPLE}
```

## Failure diagnosis

| Symptom | First evidence to inspect | Likely boundary |
|---|---|---|
| {HUMAN_SYMPTOM} | {HUMAN_EVIDENCE} | {HUMAN_SYSTEM_BOUNDARY} |

## Version and evidence

- Documented release: `{ENGINE_VERSION}`
- Verified on: `{YYYY-MM-DD}`
- Evidence paths: `{REPOSITORY_EVIDENCE_PATHS}`
- Known limitation: {HUMAN_LIMITATION_OR_NONE}

## Related reference

- [{HUMAN_API_LABEL}](../api/{SYMBOL_PAGE}.md)
- [{HUMAN_GUIDE_LABEL}]({RELATIVE_GUIDE_PATH}.md)

<!--
HUMAN PUBLICATION CHECKLIST

- Every placeholder and authoring comment is removed.
- English and Chinese headings, diagram kinds, warnings, and links correspond.
- Exact API names match the generated pages for the documented release.
- The example was run or is explicitly marked unavailable.
- Claims cite repository evidence through source_paths.
- "When to use" and "Avoid" describe real boundaries, not marketing claims.
- The page builds with strict MkDocs and passes docs/tools/verify-site.mjs.
-->
