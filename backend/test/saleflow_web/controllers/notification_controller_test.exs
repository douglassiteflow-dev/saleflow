defmodule SaleflowWeb.NotificationControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Notifications.Notification

  @user_params %{
    email: "notif-user@example.com",
    name: "Notif User",
    password: "password123",
    password_confirmation: "password123"
  }

  @other_user_params %{
    email: "notif-other@example.com",
    name: "Other User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, user} = Accounts.register(@user_params)
    {:ok, other} = Accounts.register(@other_user_params)
    %{conn: conn, user: user, other: other}
  end

  defp create_notification!(attrs) do
    Notification
    |> Ash.Changeset.for_create(:create, attrs)
    |> Ash.create!()
  end

  # ---------------------------------------------------------------------------
  # GET /api/notifications
  # ---------------------------------------------------------------------------

  describe "GET /api/notifications" do
    test "returns user's notifications", %{conn: conn, user: user} do
      n1 = create_notification!(%{user_id: user.id, type: "meeting_soon", title: "Mote snart"})
      n2 = create_notification!(%{user_id: user.id, type: "goal_reached", title: "Mal uppnatt"})

      resp =
        conn
        |> log_in_user(user)
        |> get("/api/notifications")
        |> json_response(200)

      ids = Enum.map(resp["notifications"], & &1["id"])
      assert n1.id in ids
      assert n2.id in ids
      assert length(resp["notifications"]) == 2
    end

    test "does not return other user's notifications", %{conn: conn, user: user, other: other} do
      create_notification!(%{user_id: other.id, type: "meeting_soon", title: "Andra"})
      create_notification!(%{user_id: user.id, type: "meeting_soon", title: "Min notis"})

      resp =
        conn
        |> log_in_user(user)
        |> get("/api/notifications")
        |> json_response(200)

      assert length(resp["notifications"]) == 1
      assert hd(resp["notifications"])["title"] == "Min notis"
    end

    test "returns notifications with all fields serialized", %{conn: conn, user: user} do
      create_notification!(%{
        user_id: user.id,
        type: "meeting_soon",
        title: "Mote snart",
        body: "Om 15 minuter",
        resource_type: "meeting",
        resource_id: Ash.UUID.generate()
      })

      resp =
        conn
        |> log_in_user(user)
        |> get("/api/notifications")
        |> json_response(200)

      notif = hd(resp["notifications"])
      assert notif["type"] == "meeting_soon"
      assert notif["title"] == "Mote snart"
      assert notif["body"] == "Om 15 minuter"
      assert notif["resource_type"] == "meeting"
      assert notif["resource_id"] != nil
      assert notif["read_at"] == nil
      assert notif["inserted_at"] != nil
    end

    test "requires authentication", %{conn: conn} do
      conn
      |> get("/api/notifications")
      |> json_response(401)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/notifications/:id/read
  # ---------------------------------------------------------------------------

  describe "POST /api/notifications/:id/read" do
    test "marks a notification as read", %{conn: conn, user: user} do
      notif = create_notification!(%{user_id: user.id, type: "meeting_soon", title: "Test"})

      resp =
        conn
        |> log_in_user(user)
        |> post("/api/notifications/#{notif.id}/read")
        |> json_response(200)

      assert resp["ok"] == true

      # Verify it is now read
      list_resp =
        conn
        |> log_in_user(user)
        |> get("/api/notifications")
        |> json_response(200)

      read_notif = Enum.find(list_resp["notifications"], &(&1["id"] == notif.id))
      assert read_notif["read_at"] != nil
    end

    test "returns 403 when marking another user's notification as read", %{conn: conn, user: user, other: other} do
      notif = create_notification!(%{user_id: other.id, type: "meeting_soon", title: "Not mine"})

      conn
      |> log_in_user(user)
      |> post("/api/notifications/#{notif.id}/read")
      |> json_response(403)
    end

    test "returns 404 for non-existent notification", %{conn: conn, user: user} do
      conn
      |> log_in_user(user)
      |> post("/api/notifications/#{Ash.UUID.generate()}/read")
      |> json_response(404)
    end

    test "requires authentication", %{conn: conn} do
      conn
      |> post("/api/notifications/#{Ash.UUID.generate()}/read")
      |> json_response(401)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/notifications/read-all
  # ---------------------------------------------------------------------------

  describe "POST /api/notifications/read-all" do
    test "marks all user notifications as read", %{conn: conn, user: user} do
      create_notification!(%{user_id: user.id, type: "meeting_soon", title: "Notis 1"})
      create_notification!(%{user_id: user.id, type: "goal_reached", title: "Notis 2"})

      resp =
        conn
        |> log_in_user(user)
        |> post("/api/notifications/read-all")
        |> json_response(200)

      assert resp["ok"] == true

      # Verify all are read
      list_resp =
        conn
        |> log_in_user(user)
        |> get("/api/notifications")
        |> json_response(200)

      assert Enum.all?(list_resp["notifications"], &(&1["read_at"] != nil))
    end

    test "does not mark other user's notifications as read", %{conn: conn, user: user, other: other} do
      create_notification!(%{user_id: other.id, type: "meeting_soon", title: "Andras notis"})

      conn
      |> log_in_user(user)
      |> post("/api/notifications/read-all")
      |> json_response(200)

      # Verify other's notification is still unread
      list_resp =
        conn
        |> log_in_user(other)
        |> get("/api/notifications")
        |> json_response(200)

      assert hd(list_resp["notifications"])["read_at"] == nil
    end

    test "requires authentication", %{conn: conn} do
      conn
      |> post("/api/notifications/read-all")
      |> json_response(401)
    end
  end
end
