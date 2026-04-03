defmodule SaleflowWeb.UserSocketTest do
  use Saleflow.DataCase, async: true

  import Phoenix.ChannelTest

  @endpoint SaleflowWeb.Endpoint

  alias SaleflowWeb.UserSocket

  defp create_user(name, email) do
    {:ok, %{rows: [[user_id]]}} =
      Saleflow.Repo.query(
        "INSERT INTO users (id, name, email, hashed_password, role, inserted_at, updated_at) VALUES (gen_random_uuid(), $1, $2, 'fakehash', 'agent', now(), now()) RETURNING id",
        [name, email]
      )

    user_id
  end

  defp create_session(user_id, token, opts \\ []) do
    logged_out = if opts[:logged_out], do: "now()", else: "NULL"

    Saleflow.Repo.query!(
      "INSERT INTO login_sessions (id, user_id, session_token, ip_address, user_agent, logged_in_at, last_active_at, logged_out_at, force_logged_out) VALUES (gen_random_uuid(), $1, $2, '127.0.0.1', 'test', now(), now(), #{logged_out}, false)",
      [user_id, token]
    )
  end

  describe "connect/3" do
    test "connects with valid session token" do
      user_id = create_user("Test Användare", "test-socket@example.com")
      user_uuid = Saleflow.Sales.decode_uuid(user_id)
      token = "test-session-token-#{System.unique_integer([:positive])}"
      create_session(user_id, token)

      assert {:ok, socket} = connect(UserSocket, %{"token" => token})
      assert socket.assigns.user_id == user_uuid
      assert socket.assigns.user_name == "Test Användare"
    end

    test "rejects connection with invalid token" do
      assert :error = connect(UserSocket, %{"token" => "invalid-token"})
    end

    test "rejects connection without token" do
      assert :error = connect(UserSocket, %{})
    end

    test "rejects connection with logged out session" do
      user_id = create_user("Utloggad Användare", "logged-out@example.com")
      token = "logged-out-token-#{System.unique_integer([:positive])}"
      create_session(user_id, token, logged_out: true)

      assert :error = connect(UserSocket, %{"token" => token})
    end

    test "rejects connection with empty token" do
      assert :error = connect(UserSocket, %{"token" => ""})
    end
  end

  describe "id/1" do
    test "returns user_socket:user_id" do
      socket = socket(UserSocket, "user:abc-123", %{user_id: "abc-123", user_name: "Test"})
      assert UserSocket.id(socket) == "user_socket:abc-123"
    end
  end
end
