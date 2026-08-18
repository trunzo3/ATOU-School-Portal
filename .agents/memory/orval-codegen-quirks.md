---
name: Orval/OpenAPI codegen quirks
description: Spec-authoring rules to keep lib/api-spec codegen passing
---

- Use `type: number` instead of `type: integer` in openapi.yaml. **Why:** Orval emits `zod.int()` which the installed zod v3 doesn't support.
- Avoid operations with both path AND query params. **Why:** Orval generates colliding type names → TS2308. **How to apply:** move query params into a POST body (e.g. `POST /portal/{code}/answers/fetch` with `{email}`).
