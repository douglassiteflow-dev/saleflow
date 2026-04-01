defmodule Saleflow.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      SaleflowWeb.Telemetry,
      Saleflow.Repo,
      {DNSCluster, query: Application.get_env(:saleflow, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Saleflow.PubSub},
      {AshAuthentication.Supervisor, otp_app: :saleflow},
      # Start a worker by calling: Saleflow.Worker.start_link(arg)
      # {Saleflow.Worker, arg},
      # Start to serve requests, typically the last entry
      SaleflowWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Saleflow.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    SaleflowWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
