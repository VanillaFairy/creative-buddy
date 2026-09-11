# Running the tests

Full suite (the live test is excluded by config):

```bash
npx vitest run
```

One file:

```bash
npx vitest run tests/color.test.ts
```

One test by name:

```bash
npx vitest run tests/color.test.ts -t "takes the two hex forms"
```

Notes:

- `npx vitest run` does **not** typecheck. The compiler is a separate tier and it
  is part of `npm run build`. A green suite over a tree that does not compile is
  the failure mode this plan can actually hit, because two tasks add a required
  field to a shared interface. Run the build before claiming a task is done if
  you changed a type.
- Do not run `npm run test:live`. It spends real subscription credit and this
  plan touches neither `src/agent/agent-service.ts` options nor `permissions.ts`.
