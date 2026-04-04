defmodule SaleflowWeb.NotificationController do
  use SaleflowWeb, :controller

  alias Saleflow.Notifications.Notification

  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, notifications} =
      Notification
      |> Ash.Query.for_read(:for_user, %{user_id: user.id})
      |> Ash.read()

    json(conn, %{
      notifications: Enum.map(notifications, &serialize/1)
    })
  end

  def mark_read(conn, %{"id" => id}) do
    case Ash.get(Notification, id) do
      {:ok, notification} when not is_nil(notification) ->
        {:ok, _} = notification |> Ash.Changeset.for_update(:mark_read) |> Ash.update()
        json(conn, %{ok: true})

      _ ->
        conn |> put_status(404) |> json(%{error: "Notis hittades inte"})
    end
  end

  def mark_all_read(conn, _params) do
    user = conn.assigns.current_user
    uid = Ecto.UUID.dump!(user.id)

    Saleflow.Repo.query(
      "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
      [uid]
    )

    json(conn, %{ok: true})
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
