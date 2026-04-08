import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :saleflow, Saleflow.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "saleflow_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :saleflow, SaleflowWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "R7rwMh5CHRU69tiAVOJUJChTPcIFTfv6GHOgPW32hTLOIxQlJ8kiOnMVX/uZxRl7",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

# Disable Oban in tests
config :saleflow, Oban, testing: :inline

# Speed up bcrypt in tests (DO NOT use in production)
config :bcrypt_elixir, log_rounds: 1

# Mailer sandbox — no real API calls in tests
config :saleflow, :resend_api_key, "re_test_sandbox"
config :saleflow, :mailer_sandbox, true

# Telavox webhook secret for tests
config :saleflow, telavox_webhook_secret: "test-secret"
config :saleflow, :telavox_api_token, "test-telavox-token"

# Use mock Telavox client in tests
config :saleflow, :telavox_client, Saleflow.Telavox.MockClient

# R2 storage disabled in tests
config :saleflow, :r2_bucket, "test-bucket"
config :saleflow, :storage_enabled, false

# Use mock AssemblyAI client in tests
config :saleflow, :assemblyai_client, Saleflow.AssemblyAI.MockClient

# Route real AssemblyAI HTTP calls through Req.Test stub (for client_test.exs)
config :saleflow, :assemblyai_req_options, [plug: {Req.Test, Saleflow.AssemblyAI.Client}]

# Speed up poll loop in tests — 0ms between retries
config :saleflow, :assemblyai_poll_interval_ms, 0

# Skip ChromicPDF in tests (Chrome may not be available in CI/test)
config :saleflow, :skip_chromic_pdf, true
