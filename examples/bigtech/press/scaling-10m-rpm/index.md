---
name: "Scaling to 10M RPM: Lessons from the Edge"
slug: "scaling-10m-rpm"
category: "Engineering"
status: published
visibility: public
image: "./attachments/infra.png"
tags:
  - engineering
  - scale
  - performance
authors:
  - Dev Lead @ BigCorp
---

# Scaling to 10M RPM

In this post, we share our journey of optimizing our core infrastructure to handle over 10 million requests per minute during our latest product launch.

![Infrastructure Diagram](attachments/infra.png)

## The Bottleneck

Initially, our centralized database couldn't keep up with the read volume. We had to rethink our strategy.

## Key Strategies

1.  **Distributed Caching:** Moving 95% of reads to the edge.
2.  **Request Coalescing:** Reducing redundant backend hits.
3.  **Circuit Breakers:** Graceful degradation during spikes.

## Further Reading

- [Deep Dive: Our Edge Architecture](edge-architecture.md)
