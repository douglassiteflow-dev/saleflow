defmodule SaleflowWeb.WebhookControllerTest do
  use SaleflowWeb.ConnCase

  import Mox

  alias Saleflow.Accounts
  alias Saleflow.Sales
  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  setup do
    # Stub RecordingFetchWorker's API calls (triggered by Oban inline)
    Mox.stub(MockClient, :get_as, fn _token, "/calls?withRecordings=true" ->
      {:ok, %{"outgoing" => [], "incoming" => [], "missed" => []}}
    end)

    :ok
  end

  @user_params %{
    email: "agent@example.com",
    name: "Test Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  @valid_hangup %{
    "caller" => "+46701111111",
    "callee" => "+46812345678",
    "duration" => 42
  }

  defp with_secret(conn) do
    conn
    |> Plug.Test.init_test_session(%{})
    |> put_req_header("x-telavox-secret", "test-secret")
  end

  defp stub_recording_worker do
    MockClient
    |> stub(:get, fn "/calls?withRecordings=true" ->
      {:ok, %{"outgoing" => [], "incoming" => []}}
    end)
  end

  # -------------------------------------------------------------------------
  # Authentication (VerifyTelavox plug)
  # -------------------------------------------------------------------------

  describe "VerifyTelavox plug" do
    test "rejects request without secret header", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert json_response(conn, 401) == %{"error" => "Unauthorized"}
    end

    test "rejects request with wrong secret", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> put_req_header("x-telavox-secret", "wrong-secret")
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert json_response(conn, 401) == %{"error" => "Unauthorized"}
    end

    test "rejects request when configured secret is empty string", %{conn: conn} do
      original = Application.get_env(:saleflow, :telavox_webhook_secret)
      Application.put_env(:saleflow, :telavox_webhook_secret, "")

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> put_req_header("x-telavox-secret", "")
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      Application.put_env(:saleflow, :telavox_webhook_secret, original)
      assert json_response(conn, 401) == %{"error" => "Unauthorized"}
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/webhooks/telavox/hangup
  # -------------------------------------------------------------------------

  describe "POST /api/webhooks/telavox/hangup" do
    test "creates phone call and matches lead + agent", %{conn: conn} do
      stub_recording_worker()

      # Create a lead with matching phone
      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46812345678"})

      # Create a user with matching phone_number
      {:ok, user} = Accounts.register(@user_params)

      {:ok, user} =
        user
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701111111"})
        |> Ash.update()

      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert json_response(conn, 200) == %{"ok" => true}

      # Verify the phone call was created with correct IDs
      {:ok, %{rows: rows}} =
        Saleflow.Repo.query("SELECT caller, callee, duration, lead_id, user_id FROM phone_calls LIMIT 1")

      assert [[caller, callee, duration, lead_id_bin, user_id_bin]] = rows
      assert caller == "+46701111111"
      assert callee == "+46812345678"
      assert duration == 42
      assert Sales.decode_uuid(lead_id_bin) == lead.id
      assert Sales.decode_uuid(user_id_bin) == user.id
    end

    test "creates phone call even when lead/agent not matched", %{conn: conn} do
      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", %{
          "caller" => "+46709999999",
          "callee" => "+46809999999",
          "duration" => 10
        })

      assert json_response(conn, 200) == %{"ok" => true}

      {:ok, %{rows: rows}} =
        Saleflow.Repo.query("SELECT lead_id, user_id FROM phone_calls LIMIT 1")

      assert [[nil, nil]] = rows
    end

    test "handles missing duration (defaults to 0)", %{conn: conn} do
      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", %{
          "caller" => "+46701234567",
          "callee" => "+46801234567"
        })

      assert json_response(conn, 200) == %{"ok" => true}

      {:ok, %{rows: [[duration]]}} =
        Saleflow.Repo.query("SELECT duration FROM phone_calls LIMIT 1")

      assert duration == 0
    end

    test "returns 200 with ok true on success", %{conn: conn} do
      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      response = json_response(conn, 200)
      assert response == %{"ok" => true}
    end

    test "broadcasts dashboard update on successful call creation", %{conn: conn} do
      stub_recording_worker()
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "dashboard:updates")

      conn
      |> with_secret()
      |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert_receive {:dashboard_update, %{event: "call_completed", user_id: _}}
    end

    test "broadcasts dashboard update with correct user_id when agent matched", %{conn: conn} do
      stub_recording_worker()
      {:ok, user} = Accounts.register(@user_params)

      {:ok, user} =
        user
        |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701111111"})
        |> Ash.update()

      Phoenix.PubSub.subscribe(Saleflow.PubSub, "dashboard:updates")

      conn
      |> with_secret()
      |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert_receive {:dashboard_update, %{event: "call_completed", user_id: user_id}}
      assert user_id == user.id
    end

    test "broadcasts dashboard update with nil user_id when no agent matched", %{conn: conn} do
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "dashboard:updates")

      conn
      |> with_secret()
      |> post("/api/webhooks/telavox/hangup", %{
        "caller" => "+46709999999",
        "callee" => "+46809999999",
        "duration" => 10
      })

      assert_receive {:dashboard_update, %{event: "call_completed", user_id: nil}}
    end
  end
end
