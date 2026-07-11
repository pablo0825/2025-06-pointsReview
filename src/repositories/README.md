# Repository Conventions

Repository modules are the only layer that should own raw SQL strings.

- Repository functions receive a `DatabaseClient` as their first argument.
- Repository functions do not import the shared pool directly.
- Repository functions do not open, commit, or roll back transactions.
- Service functions decide whether to call repositories with the shared pool or a transaction client from `withTransaction`.
- Repository functions return database-shaped rows or small typed read models. HTTP response mapping belongs outside repositories.
- Cross-table business rules belong in services, even when they require multiple repository calls.
- SQL template strings may compose only internal fixed SQL fragments. Request params, query values, body values, cookies, headers, or any external input must always use PostgreSQL parameters such as `$1`, `$2`.

Example:

```ts
await UserRepository.findByEmail(client, email);
```

Inside a transaction:

```ts
await withTransaction(async (client) => {
  const user = await UserRepository.findById(client, userId);
  // Additional repository calls use the same transaction client.
});
```
