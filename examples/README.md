# Sentilis Examples

This directory contains real-world usage scenarios for the Sentilis platform, organized by persona. Each example includes a valid Markdown structure with frontmatter and local attachments.

## Personas

### 🚀 Entrepreneur
Ideal for startups looking to announce funding or sell high-value digital assets.
*   **Press:** Seed Round Announcement (`entrepreneur/press/funding-round`)
*   **Market:** Pitch Deck Template (`entrepreneur/market/pitch-deck`)

### 🛠️ Solofounder
Perfect for "Building in Public" and Micro-SaaS.
*   **Press:** Monthly Revenue Report (`solofounder/press/revenue-report`)
*   **Market:** Lifetime Deal (`solofounder/market/lifetime-deal`)

### 🏢 BigTech
Tailored for enterprise engineering blogs and high-availability API subscriptions.
*   **Press:** Scaling to 10M RPM Blog Series (`bigtech/press/scaling-10m-rpm`)
*   **Market:** Enterprise API Access (`bigtech/market/enterprise-api`)

### ✍️ Personal Brand
For consultants, coaches, and content creators.
*   **Press:** Productivity Tools List (`personal-brand/press/productivity-tools`)
*   **Market:** 1-on-1 Strategy Session (`personal-brand/market/coaching-session`)

## How to use

You can use the Sentilis CLI to validate these examples locally before pushing them:

```bash
# Dry-run a complex press entry
$ sentilis press push ./examples/bigtech/press/scaling-10m-rpm --dry-run

# Dry-run a market product
$ sentilis market push ./examples/solofounder/market/lifetime-deal/lifetime-deal.md --dry-run
```
