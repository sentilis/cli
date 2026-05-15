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

The **Sentilis CLI** is a powerful tool designed to seamlessly bridge your local development workflow with the Sentilis platform. Built on top of [`@sentilis/core`](./packages/core/README.md), it enables you to confidently validate, manage, and push content directly from your terminal using simple, trackable Markdown files.

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

## Global Options

*   `--profile <name>`, `-p`: Use a specific authentication profile.

### 2. Bio Commands

Manage your Sentilis Bio (resume / profile). New to Bios? Read [What is a Bio?](https://sentilis.me/en/press/what-is-a-bio-6a016eb9550ca18de606688f?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=bio-section).

*   **Push:** Deploy a bio from a Markdown file or a directory of language variants.
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

Manage your Sentilis Press entries and articles. New to Press? Read [What is a Press?](https://sentilis.me/en/press/what-is-a-press-69f1aa4c8d8ef9e4cd7491c8?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=press-section).

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

### 4. Market Commands

Manage your Sentilis Market products. New to Market? Read [What is Market?](https://sentilis.me/en/press/what-is-market-6a016eba550ca18de6066893?utm_source=github&utm_medium=readme&utm_campaign=cli-docs&utm_content=market-section).

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


## Suggested Workspace Layout

The CLI accepts either a single Markdown file or a directory. We recommend organizing your content one folder per *persona* (a brand, a side-project, a client), with one subfolder per command type. Each entry that needs binary assets (cover image, attachments, embedded media) lives in its own subdirectory with a sibling `./attachments/` folder.

```
my-content/
├── bio/                              # one bio per persona
│   ├── index.md                      # default language
│   ├── es.md                         # language variants
│   ├── fr.md
│   └── attachments/
│       └── avatar.png
├── press/
│   ├── productivity-tools/
│   │   ├── productivity-tools.md
│   │   └── attachments/
│   │       ├── image.png
│   │       └── chart.png
│   └── another-article.md            # standalone, no assets
└── market/
    ├── coaching-session/
    │   ├── coaching-session.md
    │   └── attachments/
    │       ├── image.png             # auto-detected as cover
    │       └── attachment.zip        # auto-detected as deliverable
    └── lifetime-deal.md              # standalone product
```

**Conventions worth knowing:**

*   **One `.md` per directory.** A push from a directory expects exactly one `.md` file — that file is the entry. The folder name is independent of the slug (which comes from the frontmatter).
*   **All local assets must live inside `./attachments/`.** References that escape the directory (`../foo.png`, absolute paths, symlinks) are rejected before upload.
*   **Auto-detection.** In `market`, if no `image` or `attachment` field is set in frontmatter, the CLI probes `./attachments/image.{png,jpg,jpeg,webp}` and `./attachments/attachment.zip` automatically.
*   **Single-file mode.** A standalone `.md` can be pushed directly (no directory, no assets). Useful for quick drafts.
*   **Run `--dry-run` first.** `press push` and `market push` accept `--dry-run` to validate frontmatter, links, and asset paths without uploading.
*   **Version control.** This layout is plain text + binaries; commit the whole `my-content/` tree to `git` to track edits over time.

See the [`examples/`](./examples) directory for real layouts (e.g. `personal-brand`, `entrepreneur`).



## Related Packages

*   **[@sentilis/core](./packages/core/README.md)**: TypeScript SDK for building custom integrations and parsing Sentilis-flavored Markdown.

## Stay in touch

- Author - [Sentilis](https://sentilis.me)
- Website - [https://sentilis.me](https://sentilis.me)
- X - [https://x.com/SentilisMe](https://x.com/SentilisMe)

## Support

For issues and feature requests, please use the GitHub Issues page.

## License

Sentilis CLI is [MIT licensed](./LICENSE). See the [Contributing Guide](./CONTRIBUTING.md) for more details.
