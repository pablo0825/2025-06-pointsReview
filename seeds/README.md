# Development / Test Seed Accounts

These accounts exist only for local development and automated tests. The seed runner rejects development and test seeds when `NODE_ENV=production`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.test` | `PointsReview-Dev-2026!` |
| Reviewer | `reviewer@example.test` | `PointsReview-Dev-2026!` |
| Advisor | `advisor@example.test` | `PointsReview-Dev-2026!` |

The SQL files store only an Argon2id hash. Do not reuse these credentials in staging or production.
