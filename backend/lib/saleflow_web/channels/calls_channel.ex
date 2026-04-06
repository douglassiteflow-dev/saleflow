defmodule SaleflowWeb.CallsChannel do
  use Phoenix.Channel

  @impl true
  def join("calls:live", _payload, socket) do
    Phoenix.PubSub.subscribe(Saleflow.PubSub, "calls:live")
    {:ok, socket}
  end

  @impl true
  def handle_info({:live_calls, calls}, socket) do
    push(socket, "live_calls", %{calls: calls})
    {:noreply, socket}
  end
end
