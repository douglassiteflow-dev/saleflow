defmodule SaleflowWeb.DashboardChannel do
  use Phoenix.Channel

  @impl true
  def join("dashboard:updates", _payload, socket) do
    Phoenix.PubSub.subscribe(Saleflow.PubSub, "dashboard:updates")
    {:ok, socket}
  end

  @impl true
  def handle_info({:dashboard_update, payload}, socket) do
    push(socket, "stats_updated", payload)
    {:noreply, socket}
  end
end
