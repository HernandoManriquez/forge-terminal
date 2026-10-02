# Project operating standard

- Plan changes proportionately; record objective and progress in `planner.md`.
- Retain architectural decisions and known limitations in `memory.md`.
- Keep the application local, with loopback binding, authentication and origin checks.
- Never execute autocomplete text or run saved commands while restoring a layout.
- Preserve native PTY behavior, bounded buffers and cleanup of closed sessions.
- Favor a small runtime and explicit features over dependencies or polling.
- Run the project quality gate and the relevant native build after meaningful changes.
- Do not delete or weaken tests to obtain a passing result. Investigate inconsistent
  expectations against the specification, document the reason, and preserve coverage.
- Cross-compilation is not runtime validation. Label platform checks accurately.
- Update README, specification and tests when behavior changes.
- Do not commit secrets, command output from real work, or user configuration.
