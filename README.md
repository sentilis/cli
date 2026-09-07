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

![cover.png](cover.png)
> How your entry looks on Sentilis. [See it live →](https://sentilis.me/en)

## Description

The **Sentilis CLI** is a powerful tool designed to seamlessly bridge your local development workflow with the Sentilis platform. It enables you to confidently validate, manage, and push content directly from your terminal using simple, trackable Markdown files.

The package also ships the isomorphic TypeScript SDK the CLI is built on, so you can drive the same validation and publishing logic from your own code. As of v2 this SDK lives here; it was previously published separately as `@sentilis/core`, which is now retired. See [Use as a library](#use-as-a-library).

## Installation

Install the CLI globally using npm:

```bash
$ npm install -g @sentilis/cli
```


*Note: You can also execute it on the fly using `npx` (e.g., `npx @sentilis/cli list`).*

## Getting Started

### 1. Authentication

To use the CLI, you must first authenticate with your personal token.

> Get your token at [https://id.sentilis.me/login](https://id.sentilis.me/login).

```bash
$ sentilis auth login <your-token>
```

Other authentication commands:
*   `sentilis auth whoami`: Display the active profile.
*   `sentilis auth profiles`: List all saved profiles.
*   `sentilis auth logout`: Remove the active profile.
*   `sentilis auth logout --all`: Remove all saved profiles.

### Global Options

*   `--profile <name>`, `-p`: Use a specific authentication profile.

### 2. Bio Commands

Manage your Sentilis Bio (resume / profile). New to Bios? Read [What is a Bio?](https://about.sentilis.me/bio?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=bio-section).

*   **Push:** Deploy a bio from a Markdown file or a directory of language variants. Use `--dry-run` to validate syntax and assets without pushing.
    ```bash
    $ sentilis bio push ./examples/personal-brand/bio
    ```
*   **List:** View your bios.
    ```bash
    $ sentilis bio list
    ```
*   **Info:** Get details of a bio, including its language variants.
    ```bash
    $ sentilis bio info <id>
    ```
*   **Remove:** Delete a bio.
    ```bash
    $ sentilis bio remove <id>
    ```

### 3. Press Commands

Manage your Sentilis Press entries and articles. New to Press? Read [What is a Press?](https://about.sentilis.me/press?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=press-section).

*   **Push:** Deploy an article from a Markdown directory. Sentilis automatically handles multi-file structures and assets.
    ```bash
    $ sentilis press push ./examples/bigtech/press/scaling-10m-rpm
    ```
    > **Cover image:** if no `cover:` field is set in frontmatter, the CLI auto-detects `./attachments/cover.{png,jpg,jpeg,webp}` as the cover.
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

### 4. Market Commands

Manage your Sentilis Market products. New to Market? Read [What is Market?](https://about.sentilis.me/market?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=market-section).

*   **Push:** Validate and deploy a new product from a Markdown file. Use `--dry-run` to validate syntax and attachments without pushing.
    ```bash
    $ sentilis market push ./examples/solofounder/market/lifetime-deal/lifetime-deal.md
    ```
*   **List:** View your published market products.
    ```bash
    $ sentilis market list
    ```
*   **Attach:** Upload a private attachment (e.g. PDF, ZIP) to an existing product, identified by ID. The file is stored privately on S3 and linked to the product.
    ```bash
    $ sentilis market attach <id> ./file.pdf
    ```
*   **Remove:** Delete a product from the market.
    ```bash
    $ sentilis market remove <id>
    ```

### 5. Sync

Validate and publish every entry under a workspace directory in one shot. A workspace is a folder containing any of `bio/`, `press/`, or `market/` — typically one persona per workspace, the same layout the `examples/` directory uses. Designed for the same flow locally and in CI: install, login, run `sentilis sync`.

*   **Push everything (lenient, default):** Walk the workspace, validate each entry, report issues on bad ones, and publish the clean ones. Use this when partial progress is preferable.
    ```bash
    $ sentilis sync ./examples/personal-brand
    ```
*   **Strict mode:** If *any* entry has validation issues, abort the whole run without publishing anything. Use this in CI to make a bad file fail the pipeline.
    ```bash
    $ sentilis sync ./examples/personal-brand --strict
    ```
*   **Dry run:** Validate everything without uploading. Combine with `--strict` to mirror the CI gate locally before committing.
    ```bash
    $ sentilis sync ./examples/personal-brand --dry-run --strict
    ```

Exit codes are pipeline-friendly: `0` only when every requested step succeeded; `1` when a publish call fails, when `--strict` finds issues, or when nothing publishable was found.


> Looking for ready-made starting points? Browse the [Awesome Templates for Bio, Market & Press](https://sentilis.me/en/press/awesome-templates-bio-market-press-6a0b2e43550ca18de60a7d8a).

## Use as a library

Everything the CLI does is available programmatically. Install the package and import from it directly:

```ts
import { RestClient } from "@sentilis/cli";
import { createPress, publishPress } from "@sentilis/cli/press";
import { NodeFileSystem } from "@sentilis/cli/node";

const fs = new NodeFileSystem();
const client = new RestClient(process.env.SENTILIS_TOKEN!);

const entry = await createPress(fs, "./press/my-article");
await publishPress(client, fs, entry);
```

### Entry points

| Import | Contents |
| --- | --- |
| `@sentilis/cli` | `RestClient`, `validateToken`, `formatIssue`, `SentilisError`, the `FileSystem` adapter interface, path helpers, and the `press` / `market` / `bio` / `workspace` namespaces |
| `@sentilis/cli/press` | `createPress`, `publishPress`, press types and markdown helpers |
| `@sentilis/cli/market` | `createProduct`, `publishProduct`, product types and markdown helpers |
| `@sentilis/cli/bio` | `createBio`, `publishBio`, bio types and markdown helpers |
| `@sentilis/cli/workspace` | `discoverWorkspace` — the walker behind `sentilis sync` |
| `@sentilis/cli/press/markdown`, `@sentilis/cli/market/markdown`, `@sentilis/cli/bio/markdown` | frontmatter parsing and validation helpers on their own |
| `@sentilis/cli/node` | `NodeFileSystem`, the Node-backed `FileSystem` adapter |

**Everything except `./node` is isomorphic** — no Node-specific imports, so it runs unchanged in browsers, Workers, Deno, Bun and Obsidian mobile. Supply your own `FileSystem` adapter in those environments; `./node` is the one entry point that requires a Node runtime. This is enforced in CI, not just intended.

Debug logging is written to stderr when `DEBUG=1`, and is honoured only where a `process` global exists.

## Stay in touch
- Website - [https://about.sentilis.me](https://about.sentilis.me?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=stay-in-touch-website)
- X - [https://x.com/SentilisMe](https://x.com/SentilisMe)

## Support

For issues and feature requests, please use the GitHub Issues page.

## License

Sentilis CLI is licensed under the [GNU Affero General Public License v3.0](./LICENSE). See the [Contributing Guide](./CONTRIBUTING.md) for more details.
