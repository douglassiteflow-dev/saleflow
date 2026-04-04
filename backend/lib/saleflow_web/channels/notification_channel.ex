defmodule SaleflowWeb.NotificationChannel do
  use Phoenix.Channel

  @impl true
  def join("notifications:" <> user_id, _payload, socket) do
    if socket.assigns.user_id == user_id do
      {:ok, socket}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info({:new_notification, notification}, socket) do
    push(socket, "new_notification", notification)
    {:noreply, socket}
  end
end
