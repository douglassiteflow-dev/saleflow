defmodule Saleflow.Repo do
  use AshPostgres.Repo,
    otp_app: :saleflow

  def installed_extensions do
    ["ash-functions", "citext", "uuid-ossp"]
  end
end
