# Deep Dive: Our Edge Architecture

To achieve sub-50ms latency globally, we leveraged a distributed architecture across 12 regions.

## Regional Failover
Our system automatically routes traffic to the nearest healthy node using BGP anycast.

## Data Consistency
We use a conflict-free replicated data type (CRDT) to ensure content eventually converges across all nodes without locking.
