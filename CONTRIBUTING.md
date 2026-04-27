# Contributing to Sentilis

Thank you for your interest in contributing to Sentilis! We welcome issues and pull requests that improve the CLI, the Core SDK, or our documentation.

## Development Setup

This repository is a monorepo using NPM workspaces.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/sentilis/cli.git
    cd cli
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Build the project**:
    ```bash
    npm run build
    ```

## Project Structure

- `apps/cli`: The source code for `@sentilis/cli`.
- `packages/core`: The source code for `@sentilis/core`.
- `examples`: Persona-based examples for testing and documentation.

## Coding Standards

- We use **TypeScript** for all logic.
- Follow the existing architectural patterns (Service/Repository).
- Ensure any new metadata fields are added to both `Press` and `Market` where appropriate.
- **Security First**: Always use `realpath` when validating local file paths to prevent traversal attacks.

## Pull Request Process

1.  Create a new branch for your feature or bugfix.
2.  Add tests or examples to verify your changes.
    - New persona examples go in `examples/`.
3.  Ensure the project builds correctly: `npm run build`.
4.  Submit your PR with a clear description of the changes and the "why" behind them.

## Questions?

Feel free to open an issue or reach out to us on [X (Twitter)](https://x.com/SentilisMe).
