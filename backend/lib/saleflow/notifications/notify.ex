defmodule Saleflow.Notifications.Notify do
  @moduledoc "Helper to create a notification and broadcast it via PubSub."

  alias Saleflow.Notifications.Notification

  def send(attrs) do
    case Notification |> Ash.Changeset.for_create(:create, attrs) |> Ash.create() do
      {:ok, notification} ->
        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "notifications:#{attrs.user_id}",
          {:new_notification, serialize(notification)}
        )

        {:ok, notification}

      error ->
        error
    end
  end

  defp serialize(n) do
    %{
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      resource_type: n.resource_type,
      resource_id: n.resource_id,
      read_at: n.read_at,
      inserted_at: n.inserted_at
    }
  end
end
