<p align="center">
  <h1 align="center">@sentilis/cli</h1>
</p>

<p align="center">
  <strong>The official command-line interface for the Sentilis platform.</strong>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@sentilis/cli" target="_blank"><img src="https://img.shields.io/npm/v/@sentilis/cli.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/package/@sentilis/cli" target="_blank"><img src="https://img.shields.io/npm/l/@sentilis/cli.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@sentilis/cli" target="_blank"><img src="https://img.shields.io/npm/dm/@sentilis/cli.svg" alt="NPM Downloads" /></a>
</p>

## Description

The **Sentilis CLI** is a powerful tool designed to seamlessly bridge your local development workflow with the Sentilis platform. Built on top of [`@sentilis/core`](../../packages/core/README.md), it enables you to confidently validate, manage, and push content directly from your terminal using simple, trackable Markdown files.

## Installation

Install the CLI globally using npm:

```bash
$ npm install -g @sentilis/cli
```

*Note: You can also execute it on the fly using `npx` (e.g., `npx @sentilis/cli list`).*

## Getting Started

### 1. Authentication

To use the CLI, you must first authenticate with your personal token.

```bash
$ sentilis auth login <your-token>
```

Other authentication commands:
*   `sentilis auth whoami`: Display the active profile.
*   `sentilis auth profiles`: List all saved profiles.
*   `sentilis auth logout`: Remove the active profile.
*   `sentilis auth logout --all`: Remove all saved profiles.

### 2. Press Commands

Manage your Sentilis Press entries and articles.

*   **Push:** Deploy an article from a Markdown directory. Sentilis automatically handles multi-file structures and assets.
    ```bash
    $ sentilis press push ./examples/bigtech/press/scaling-10m-rpm
    ```
*   **List:** View your press entries. Use `--visibility` to filter by access level (e.g., `public`, `private`, `protected`, `prime`). Defaults to `public`. Multiple values can be comma-separated.
    ```bash
    $ sentilis press list --visibility=public,private
    ```
*   **Info:** Get detailed information about a specific press entry, including its children.
    ```bash
    $ sentilis press info <id>
    ```
*   **Remove:** Delete a press entry.
    ```bash
    $ sentilis press remove <id>
    ```

### 3. Market Commands (Beta)

Manage your Sentilis Market products. Note: Market features are currently in Beta.

*   **Push:** Validate and deploy a new product from a Markdown file. Use `--dry-run` to validate syntax and attachments without pushing.
    ```bash
    $ sentilis market push ./examples/solofounder/market/lifetime-deal/lifetime-deal.md
    ```
*   **List:** View your published market products.
    ```bash
    $ sentilis market list
    ```
*   **Remove:** Delete a product from the market.
    ```bash
    $ sentilis market remove <id>
    ```

## Global Options

*   `--profile <name>`, `-p`: Use a specific authentication profile.

## Metadata Schema

Every Markdown file must start with a YAML frontmatter block. The following fields are supported:

### Common Fields

| Field        | Type     | Required | Default     | Description |
|--------------|----------|----------|-------------|-------------|
| `name`       | `string` | Yes      | (inferred)  | Display name of the entry. |
| `slug`       | `string` | Yes      | (inferred)  | Unique identifier for the URL. |
| `category`   | `string` | No       | `null`      | Grouping category. |
| `status`     | `enum`   | No       | `published` | Lifecycle: `draft`, `published`, `archived`. |
| `visibility` | `enum`   | No       | `public`    | Access: `public`, `private`, `protected`, `prime`. |

### Press Specific

*   **`image`**: Path to cover image for social sharing (OpenGraph) in `./attachments/`. Auto-detected if a file named `image.{png,jpg,jpeg,webp}` exists.
*   **`tags`**: List of strings for filtering.
*   **`authors`**: List of strings representing the creators.

### Market Specific (Beta)

*   **`kind`**: Type of product (`service`, `product`, `subscription`, `digital`).
*   **`price`**: Numeric value (>= 0).
*   **`currency`**: ISO code (e.g., `USD`).
*   **`image`**: Path to cover image in `./attachments/`.
*   **`attachment`**: Path to file in `./attachments/` (required for `digital`).

## Stay in touch

- Author - [Sentilis](https://sentilis.me)
- Website - [https://sentilis.me](https://sentilis.me)
- X - [https://x.com/SentilisMe](https://x.com/SentilisMe)

## Support

For issues and feature requests, please use the GitHub Issues page.

## License

Sentilis CLI is [MIT licensed](../../LICENSE). See the [Contributing Guide](../../CONTRIBUTING.md) for more details.
