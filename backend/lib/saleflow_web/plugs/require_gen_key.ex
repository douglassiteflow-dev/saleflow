defmodule SaleflowWeb.Plugs.RequireGenKey do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:saleflow, :genflow_api_key)
    provided = get_req_header(conn, "x-genflow-key") |> List.first()

    if provided && Plug.Crypto.secure_compare(provided, expected) do
      conn
    else
      conn
      |> put_status(:unauthorized)
      |> Phoenix.Controller.json(%{error: "Invalid API key"})
      |> halt()
    end
  end
end
