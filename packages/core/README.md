<p align="center">
  <h1 align="center">@sentilis/core</h1>
</p>

<p align="center">
  <strong>The core SDK for the Sentilis platform.</strong>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@sentilis/core" target="_blank"><img src="https://img.shields.io/npm/v/@sentilis/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/package/@sentilis/core" target="_blank"><img src="https://img.shields.io/npm/l/@sentilis/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@sentilis/core" target="_blank"><img src="https://img.shields.io/npm/dm/@sentilis/core.svg" alt="NPM Downloads" /></a>
</p>

## Description

The **`@sentilis/core`** library provides the foundational APIs, models, and HTTP clients to programmatically interact with the Sentilis platform. It powers the official [Sentilis CLI](../../apps/cli/README.md) and custom integrations.

Sentilis is built around **developer-first publishing**. Everything is structured, validated, and managed locally using Markdown before syncing to the cloud.

## Installation

```bash
$ npm install @sentilis/core
```

## Getting Started

Initialize the REST client with your Sentilis token and interact with the platform services.

```typescript
import { RestClient } from '@sentilis/core';

// Initialize the client
const client = new RestClient('your-access-token', 'prod');

// Example: Fetch press entries
const result = await client.listPress({
  rootOnly: true,
  page: 1,
  limit: 20
});

console.log(result.data);
```

### Core Modules

*   **`RestClient`**: High-level wrapper for Sentilis HTTP APIs (`listPress`, `removePress`, `listProduct`, `removeProduct`, `publishPress`, `publishProduct`).
*   **`press`**: Extensible Markdown validation and parsing for press resources and their attachments.
*   **`market`**: Intelligent product schema validation and parsing.

## Stay in touch

- Author - [Sentilis](https://sentilis.me)
- Website - [https://sentilis.me](https://sentilis.me)
- X - [https://x.com/SentilisMe](https://x.com/SentilisMe)

## License

Sentilis Core is [MIT licensed](../../LICENSE). See the [Contributing Guide](../../CONTRIBUTING.md) for more details.
