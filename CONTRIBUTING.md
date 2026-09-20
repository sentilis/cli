# Contributing to Sentilis

Thank you for your interest in contributing to Sentilis! We welcome issues and pull requests that improve the CLI or our documentation.

The validation and publishing logic lives in [`@sentilis/sdk`](https://www.npmjs.com/package/@sentilis/sdk), inside the platform monorepo. If your change is about *what a valid press entry is*, it belongs there; if it is about *what the terminal does with it*, it belongs here.

## Development Setup

This repository publishes the `sentilis` binary. It depends on `@sentilis/sdk` like any other consumer.

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
- `src/compat/`: one-line re-exports of `@sentilis/sdk`, so the subpaths this package used to publish (`@sentilis/cli/press` and friends) keep working through all of 5.x. They are removed in 6.0 and nothing else should import them.
- `examples/`: persona-based example workspaces, used as dry-run fixtures in CI.
- `scripts/`: build-time checks.

One rule keeps that structure honest, and it is enforced in CI:

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
