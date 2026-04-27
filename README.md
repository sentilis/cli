<p align="center">
  <h1 align="center">Sentilis</h1>
</p>

<p align="center">
  <strong>The developer-first publishing platform.</strong>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@sentilis/cli" target="_blank"><img src="https://img.shields.io/npm/v/@sentilis/cli.svg?label=cli" alt="CLI Version" /></a>
<a href="https://www.npmjs.com/package/@sentilis/core" target="_blank"><img src="https://img.shields.io/npm/v/@sentilis/core.svg?label=core" alt="Core Version" /></a>
<a href="https://www.npmjs.com/package/@sentilis/core" target="_blank"><img src="https://img.shields.io/npm/l/@sentilis/core.svg" alt="License" /></a>
</p>

## Overview

Sentilis is a monorepo containing the official tools for the Sentilis platform. It allows developers to manage and publish their content using GitOps principles and Markdown.

- **[@sentilis/cli](./apps/cli/README.md)**: The command-line interface for manual and CI/CD publishing.
- **[@sentilis/core](./packages/core/README.md)**: The TypeScript SDK for building custom integrations and parsing Sentilis-flavored Markdown.

## Quick Start

### Installation

```bash
# Global CLI installation
$ npm install -g @sentilis/cli

# Project SDK installation
$ npm install @sentilis/core
```

### Usage

1. **Login** with your personal token:
   ```bash
   $ sentilis auth login <your-token>
   ```

2. **Push** your first press entry:
   ```bash
   $ sentilis press push ./examples/bigtech/press/scaling-10m-rpm
   ```

3. **Check** your identity:
   ```bash
   $ sentilis auth whoami
   ```

## Repository Structure

```
.
├── apps/
│   └── cli/          # Source for @sentilis/cli
├── packages/
│   └── core/         # Source for @sentilis/core
└── examples/         # Real-world usage personas (Entrepreneur, BigTech, etc.)
```

## Documentation

Detailed documentation for each package is available in their respective directories:

- [CLI Documentation](./apps/cli/README.md)
- [Core SDK Documentation](./packages/core/README.md)
- [Example Personas](./examples/README.md)
- [Contributing Guide](./CONTRIBUTING.md)

## Contributing

We welcome contributions from the community! Please see our [Contributing Guide](./CONTRIBUTING.md) for more information on how to get started.

## Stay in touch

- Author - [Sentilis](https://sentilis.me)
- Website - [https://sentilis.me](https://sentilis.me)
- X - [https://x.com/SentilisMe](https://x.com/SentilisMe)

## License

Sentilis is [MIT licensed](LICENSE).
