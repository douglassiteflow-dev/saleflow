# Accounts Domain

The `Saleflow.Accounts` domain manages user accounts and authentication for SaleFlow. It is built on Ash 3.7 with AshAuthentication 4.13 using the password strategy (bcrypt hashing, JWT tokens).

## Resources

### `Saleflow.Accounts.User`

Represents a system user — either an admin or a sales agent.

#### Fields

| Field             | Type       | Constraints                    | Default   | Notes                        |
|-------------------|------------|--------------------------------|-----------|------------------------------|
| `id`              | `uuid`     | primary key                    | generated | UUID v4 via `gen_random_uuid()` |
| `email`           | `ci_string`| non-null, unique               | —         | Case-insensitive (citext)    |
| `hashed_password` | `string`   | non-null, sensitive            | —         | bcrypt hash, never exposed   |
| `name`            | `string`   | non-null                       | —         | Full display name            |
| `role`            | `atom`     | one of `:admin`, `:agent`      | `:agent`  | User permission level        |
| `inserted_at`     | `utc_datetime_usec` | non-null              | `now()`   | Created timestamp            |
| `updated_at`      | `utc_datetime_usec` | non-null              | `now()`   | Last updated timestamp       |

#### Actions

| Action                  | Type     | Description                                      |
|-------------------------|----------|--------------------------------------------------|
| `register_with_password`| create   | Create a user with email, name, role, password, and password_confirmation. Validates confirmation match, hashes password, generates JWT token. |
| `sign_in_with_password` | read     | Authenticate via email + password. Returns user on success, error on failure. |
| `list`                  | read     | Return all users sorted by `inserted_at` ascending. |
| `update_user`           | update   | Update `name` and/or `role` on an existing user. |
| `get_by_subject`        | read     | Fetch a user by JWT subject claim (used internally by AshAuthentication). |

### `Saleflow.Accounts.Token`

Stores JWT tokens for authentication. Managed entirely by AshAuthentication — tokens are generated on sign-in/register and purged when expired. Direct interaction with this resource is not needed in application code.

## Domain API

The `Saleflow.Accounts` module exposes three public functions:

### `register/1`

```elixir
@spec register(map()) :: {:ok, User.t()} | {:error, Ash.Error.t()}
```

Registers a new user. Required keys: `:email`, `:name`, `:password`, `:password_confirmation`. Optional: `:role` (defaults to `:agent`).

```elixir
{:ok, user} = Saleflow.Accounts.register(%{
  email: "agent@example.com",
  name: "Jane Smith",
  password: "secret123",
  password_confirmation: "secret123"
})

{:ok, admin} = Saleflow.Accounts.register(%{
  email: "admin@example.com",
  name: "Admin User",
  password: "secret123",
  password_confirmation: "secret123",
  role: :admin
})
```

### `sign_in/1`

```elixir
@spec sign_in(map()) :: {:ok, User.t()} | {:error, Ash.Error.t()}
```

Authenticates a user by email and password. Returns `{:ok, user}` with a `__metadata__.token` JWT on success, or `{:error, reason}` on failure. Email comparison is case-insensitive.

```elixir
{:ok, user} = Saleflow.Accounts.sign_in(%{
  email: "agent@example.com",
  password: "secret123"
})

# JWT token available at:
token = user.__metadata__.token
```

### `list_users/0`

```elixir
@spec list_users() :: {:ok, list(User.t())} | {:error, Ash.Error.t()}
```

Returns all users sorted by `inserted_at` ascending (oldest first).

```elixir
{:ok, users} = Saleflow.Accounts.list_users()
Enum.each(users, fn u -> IO.puts("#{u.name} (#{u.role})") end)
```

## Authentication Flow

1. **Registration**: Client submits email, name, password, and password_confirmation. AshAuthentication validates the confirmation match, hashes the password with bcrypt, persists the user, and generates a signed JWT.

2. **Sign-in**: Client submits email and password. AshAuthentication looks up the user by email (case-insensitively), verifies the bcrypt hash, and generates a signed JWT on success.

3. **JWT verification**: Downstream controllers/plugs can verify the JWT using `AshAuthentication.Jwt.verify/2` or via `load_from_bearer` plug helper from `AshAuthentication.Plug.Helpers`.

4. **Token presence**: `require_token_presence_for_authentication?` is set to `true`, meaning tokens must exist in the `tokens` table to be considered valid. This enables proper token revocation on logout.

## Configuration

Token signing secret is set in `config/config.exs`:

```elixir
config :saleflow, :token_signing_secret, "your-secret-key"
```

In production, read this from an environment variable:

```elixir
config :saleflow, :token_signing_secret, System.fetch_env!("TOKEN_SIGNING_SECRET")
```

## Supervisor

`AshAuthentication.Supervisor` is registered in `Saleflow.Application` to handle background tasks such as periodic purging of expired tokens from the `tokens` table.

## Database

Two tables are created by the `add_users` migration:

- `users` — user records with a `citext` email column for case-insensitive uniqueness
- `tokens` — JWT token store with `jti` primary key and `expires_at` for expiry tracking

The `citext` PostgreSQL extension is enabled via `Saleflow.Repo.installed_extensions/0`.

## Testing

Tests live in `test/saleflow/accounts/user_test.exs`. bcrypt rounds are reduced to 1 in the test environment for speed (configured in `config/test.exs`).

Run:

```sh
cd backend
mix test test/saleflow/accounts/
```
