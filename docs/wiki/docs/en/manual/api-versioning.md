---
title: "API Versioning and Compatibility"
description: "Explain API snapshot immutability, machine-readable version comparisons, current 0.2.1 baseline limits, and how to interpret added, removed, or changed symbols."
category: Manual
tags: ["api", "version", "compatibility", "agent"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: []
agent_summary: "Explain API snapshot immutability, machine-readable version comparisons, current 0.2.1 baseline limits, and how to interpret added, removed, or changed symbols."
source_paths: ["docs/tools/build-api-diff.mjs", "docs/api-snapshots", "docs/api-changes.json", "docs/api-index.json"]
---

# API Versioning and Compatibility

The generated API index describes one documented engine release. A compact immutable snapshot records its English symbol keys, kinds, signatures, status, and canonical URLs. The next release is compared with the nearest earlier snapshot.

## Current baseline

`0.2.1` is the first authoritative snapshot. There is no earlier machine-readable API baseline in the repository, so the current comparison correctly reports `comparison_available: false`. It does not infer history from file dates or commit noise.

- [Current API index](https://infernux-engine.com/api-index.json)
- [Machine-readable API changes](https://infernux-engine.com/api-changes.json)

## Interpreting a future comparison

| Change | Meaning | Migration response |
|---|---|---|
| Added | a new symbol key appears | optional adoption; check status and `since` |
| Removed | an earlier symbol key is absent | find replacement before upgrading |
| Changed | kind, signature, status, or `since` differs | inspect changed fields and exact API page |

A change record is evidence of a structural API difference, not a complete behavioral compatibility promise. Read release notes and affected Manual/Learn pages before migration.

## Release rule

The snapshot for a released version must not silently move. CI fails when the current API differs from the recorded snapshot. Maintainers must either restore the release API, update the documented release version, or explicitly record an intentional new release baseline.

Agents should compare their installed engine version with `generated_for_release` before suggesting code. When no comparison exists, say so rather than inventing compatibility.
