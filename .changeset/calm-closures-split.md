---
"dismantle": minor
---

Split code can now use local functions and classes. They are copied into the root file instead of being sent.
Mutated variables sync back correctly for generators and blocks with `yield`.
Blocks in non-async functions are no longer split.
The runtime exports changed, so the compiler and runtime must be upgraded together.
In development, split IDs now use hierarchical names like `<hash>-foo.bar`.
The `isomorphic` option works again. It emits the split code in `client` mode too.
