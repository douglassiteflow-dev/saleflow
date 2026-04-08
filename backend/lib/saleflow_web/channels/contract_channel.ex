defmodule SaleflowWeb.ContractChannel do
  use Phoenix.Channel

  alias Saleflow.Contracts

  # Debounce DB writes — persist every 5 seconds, but broadcast instantly
  @db_flush_interval 5_000

  @impl true
  def join("contract:" <> token, _params, socket) do
    case Contracts.get_contract_by_token(token) do
      {:ok, nil} ->
        {:error, %{reason: "not_found"}}

      {:ok, contract} ->
        page_views = contract.page_views || %{}
        total = Enum.reduce(page_views, 0, fn {_k, v}, acc -> acc + v end)

        socket =
          socket
          |> assign(:contract_id, contract.id)
          |> assign(:token, token)
          |> assign(:page_views, page_views)
          |> assign(:total_view_time, total)
          |> assign(:last_page, contract.last_viewed_page)
          |> assign(:dirty, false)

        Process.send_after(self(), :flush_to_db, @db_flush_interval)

        {:ok, socket}

      {:error, _} ->
        {:error, %{reason: "not_found"}}
    end
  end

  @impl true
  def handle_in("page_view", %{"page" => page}, socket) do
    # Mark as viewed if contract is still in draft/sent status
    case Contracts.get_contract(socket.assigns.contract_id) do
      {:ok, contract} when contract.status in [:draft, :sent] ->
        Contracts.mark_viewed(contract)

      _ ->
        :ok
    end

    socket = assign(socket, :last_page, page)

    # Broadcast immediately to admin watchers
    broadcast!(socket, "tracking_update", %{
      page: page,
      total_view_time: socket.assigns.total_view_time,
      page_views: socket.assigns.page_views,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })

    {:reply, :ok, assign(socket, :dirty, true)}
  end

  @impl true
  def handle_in("heartbeat", %{"page" => page, "time_on_page" => time}, socket) do
    # Update in-memory tracking state (no DB hit)
    page_views = Map.update(socket.assigns.page_views, page, time, fn existing -> existing + time end)
    total = socket.assigns.total_view_time + time

    socket =
      socket
      |> assign(:page_views, page_views)
      |> assign(:total_view_time, total)
      |> assign(:last_page, page)
      |> assign(:dirty, true)

    # Broadcast immediately to admin watchers
    broadcast!(socket, "tracking_update", %{
      page: page,
      total_view_time: total,
      page_views: page_views,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })

    {:reply, :ok, socket}
  end

  # Periodic DB flush — persist accumulated tracking data
  @impl true
  def handle_info(:flush_to_db, socket) do
    if socket.assigns.dirty do
      case Contracts.get_contract(socket.assigns.contract_id) do
        {:ok, contract} ->
          Contracts.update_tracking(contract, %{
            last_viewed_page: socket.assigns.last_page,
            total_view_time: socket.assigns.total_view_time,
            page_views: socket.assigns.page_views
          })

        _ ->
          :ok
      end
    end

    Process.send_after(self(), :flush_to_db, @db_flush_interval)
    {:noreply, assign(socket, :dirty, false)}
  end

  # Handle PubSub broadcasts for contract updates (e.g., contract signed)
  def handle_info(%{event: event, payload: payload}, socket) do
    push(socket, event, payload)
    {:noreply, socket}
  end
end
