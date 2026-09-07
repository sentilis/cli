# Contributing to Sentilis

Thank you for your interest in contributing to Sentilis! We welcome issues and pull requests that improve the CLI, the SDK, or our documentation.

## Development Setup

This repository is a single package that publishes two things: the `sentilis` binary and the isomorphic SDK.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/sentilis/cli.git
    cd cli
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Build and verify**:
    ```bash
    npm run verify
    ```

## Project Structure

- `src/`: the CLI. Node APIs are fair game here.
- `src/sdk/`: the isomorphic SDK, published as `@sentilis/cli` and its `./press`, `./market`, `./bio`, `./workspace` subpaths. **No `node:*` imports** — `src/sdk/node.ts` is the single sanctioned exception, published as `./node`.
- `examples/`: persona-based example workspaces, used as dry-run fixtures in CI.
- `scripts/`: build-time checks.

Two rules keep that structure honest, and both are enforced in CI:

- **The SDK must stay isomorphic.** It is bundled into the [Obsidian plugin](https://github.com/sentilis/obsidian), which runs on mobile where there is no Node runtime. `npm run check:sdk` type-checks `src/sdk` with `@types/node` removed, so a `node:*` import — or a stray `process` or `Buffer` — is a compile error. `npm run check:dist` then asserts the same thing about the emitted output, and that the SDK never imports from outside its own subtree (one `import "../config.js"` would drag `node:fs` into a phone).
- **CLI entry files stay at the root of `src/`.** Both `src/index.ts` and `src/client.ts` read the package version through `require("../package.json")`, which resolves relative to the *emitted* file. Moving them into a subdirectory would break that at runtime, silently, along with the `bin` path. TypeScript will not warn you.

## Coding Standards

- We use **TypeScript** for all logic.
- Follow the existing architectural patterns (Service/Repository).
- Ensure any new metadata fields are added to both `Press` and `Market` where appropriate.
- **Security First**: Always use `realpath` when validating local file paths to prevent traversal attacks.

## Testing against the Obsidian plugin

The plugin consumes this package from the npm registry. To try a local change against it without polluting either lockfile:

```bash
# here
npm run verify && npm pack          # → sentilis-cli-<version>.tgz

# in the plugin checkout
npm install --no-save ../sentilis.cli/sentilis-cli-<version>.tgz
npm run build                        # includes the mobile-safety check
```

`--no-save` matters. A saved `file:` dependency, or `npm link`, is what left dangling symlinks and phantom lockfile entries across these repos before.

## Pull Request Process

1.  Create a new branch for your feature or bugfix.
2.  Add tests or examples to verify your changes.
    - New persona examples go in `examples/`, and should pass `--dry-run` cleanly.
3.  Run `npm run verify`.
4.  Submit your PR with a clear description of the changes and the "why" behind them.

## Releasing

Tag `vX.Y.Z` matching `package.json`; CI publishes to npm. Prerelease tags (`v2.1.0-rc.1`) go out under the `next` dist-tag and leave `latest` alone.

## Questions?

Feel free to open an issue or reach out to us on [X (Twitter)](https://x.com/SentilisMe).
