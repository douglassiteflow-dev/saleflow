# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :saleflow,
  ecto_repos: [Saleflow.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

# Configure the endpoint
config :saleflow, SaleflowWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: SaleflowWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Saleflow.PubSub,
  live_view: [signing_salt: "bMCPKrD0"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Ash domains
config :saleflow, :ash_domains, [
  Saleflow.Accounts,
  Saleflow.Sales,
  Saleflow.Audit,
  Saleflow.Notifications,
  Saleflow.Apps
]

# Token signing secret
config :saleflow, :token_signing_secret, "super-secret-token-signing-key-change-in-prod"

# Oban
config :saleflow, Oban,
  repo: Saleflow.Repo,
  queues: [default: 10, scheduled: 5],
  plugins: [
    {Oban.Plugins.Cron, crontab: [
      {"*/5 * * * *", Saleflow.Workers.AutoReleaseWorker},
      {"0 * * * *", Saleflow.Workers.QuarantineReleaseWorker},
      {"*/5 * * * *", Saleflow.Workers.MeetingReminderWorker},
      {"*/5 * * * *", Saleflow.Workers.CallbackReminderWorker},
      {"*/15 * * * *", Saleflow.Workers.MeetingStatusWorker},
      {"*/10 * * * *", Saleflow.Workers.GoalCheckWorker}
    ]}
  ]

# Resend mailer
config :saleflow, :resend_api_key, System.get_env("RESEND_API_KEY")
config :saleflow, :resend_from, "Saleflow <noreply@saleflow.se>"
config :saleflow, :mailer_sandbox, false

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
