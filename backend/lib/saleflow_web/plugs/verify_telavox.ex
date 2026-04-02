defmodule SaleflowWeb.Plugs.VerifyTelavox do
  @moduledoc """
  Plug that verifies the `x-telavox-secret` header matches the configured
  webhook secret. Returns 401 JSON if the secret is missing, empty, or wrong.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:saleflow, :telavox_webhook_secret)
    provided = get_req_header(conn, "x-telavox-secret") |> List.first()

    if valid_secret?(expected) and provided == expected do
      conn
    else
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Unauthorized"})
      |> halt()
    end
  end

  defp valid_secret?(nil), do: false
  defp valid_secret?(""), do: false
  defp valid_secret?(_), do: true
end
