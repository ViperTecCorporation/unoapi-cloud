# Architecture and capability coverage

ViperConnect separates HTTP traffic, queue orchestration and session ownership
so expensive work does not block normal message delivery.

| Process role | Responsibility |
| --- | --- |
| `web` | Manager, public API, downloads and session configuration |
| `broker` | Queue orchestration and background tasks |
| `video` | Dedicated video download and conversion |
| `worker` | Zapo session ownership and WhatsApp operations |
| `voip` | SIP, RTP, WebRTC, call routing and recordings |

Valkey stores configuration, indexes, identity aliases and transient state.
RabbitMQ isolates session queues and retries. Media may use local storage or an
S3-compatible service. The worker-to-telephony bridge stays on the internal
network.

Public capabilities are documented only after the adapter, tests and OpenAPI
contract are available. Unsupported capabilities must return an explicit error
instead of silently switching engines.
