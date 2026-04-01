defmodule Saleflow.Repo do
  use Ecto.Repo,
    otp_app: :saleflow,
    adapter: Ecto.Adapters.Postgres
end
