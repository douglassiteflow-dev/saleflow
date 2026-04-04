defmodule SaleflowWeb.UserSocket do
  use Phoenix.Socket

  channel "calls:live", SaleflowWeb.CallsChannel
  channel "dashboard:updates", SaleflowWeb.DashboardChannel
  channel "notifications:*", SaleflowWeb.NotificationChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Saleflow.Repo.query(
           "SELECT u.id, u.name FROM users u JOIN login_sessions ls ON ls.user_id = u.id WHERE ls.session_token = $1 AND ls.logged_out_at IS NULL LIMIT 1",
           [token]
         ) do
      {:ok, %{rows: [[user_id, name]]}} ->
        {:ok,
         socket
         |> assign(:user_id, Saleflow.Sales.decode_uuid(user_id))
         |> assign(:user_name, name)}

      _ ->
        :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
