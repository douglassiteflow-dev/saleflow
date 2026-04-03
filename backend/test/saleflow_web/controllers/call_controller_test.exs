defmodule SaleflowWeb.CallControllerTest do
  use SaleflowWeb.ConnCase

  import Mox

  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  # -------------------------------------------------------------------------
  # Helpers
  # -------------------------------------------------------------------------

  defp authenticated_conn(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, attrs)
  end

  defp set_telavox_token(user, token) do
    {:ok, user} =
      user
      |> Ash.Changeset.for_update(:update_user, %{telavox_token: token})
      |> Ash.update()

    user
  end

  defp create_lead(attrs \\ %{}) do
    lead_attrs =
      Map.merge(
        %{
          företag: "Test AB",
          telefon: "+46701234567"
        },
        attrs
      )

    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create_bulk, lead_attrs)
      |> Ash.create()

    lead
  end

  # -------------------------------------------------------------------------
  # POST /api/calls/dial
  # -------------------------------------------------------------------------

  describe "POST /api/calls/dial" do
    test "returns 422 when no lead_id provided", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      conn = post(conn, "/api/calls/dial", %{})

      assert json_response(conn, 422) == %{"error" => "lead_id krävs"}
    end

    test "returns 422 when user has no telavox_token", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)
      lead = create_lead()

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 422) == %{
               "error" => "Koppla Telavox i din profil för att ringa"
             }
    end

    test "returns 422 when user has empty telavox_token", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "")
      lead = create_lead()

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 422) == %{
               "error" => "Koppla Telavox i din profil för att ringa"
             }
    end

    test "returns 404 when lead does not exist", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      fake_id = Ecto.UUID.generate()
      conn = post(conn, "/api/calls/dial", %{"lead_id" => fake_id})

      assert json_response(conn, 404) == %{"error" => "Lead saknar telefonnummer"}
    end

    test "returns 404 when lead has empty phone number", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      # Insert directly via SQL since Ash validation rejects empty telefon
      lead_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        "INSERT INTO leads (id, företag, telefon, status, inserted_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
        [Ecto.UUID.dump!(lead_id), "Test AB", "", "new"]
      )

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead_id})

      assert json_response(conn, 404) == %{"error" => "Lead saknar telefonnummer"}
    end

    test "returns 200 on successful dial", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead(%{telefon: "+46701234567"})

      MockClient
      |> expect(:get_as, fn "valid-token", "/dial/+46701234567?autoanswer=false" ->
        {:ok, %{"status" => "dialing"}}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 200) == %{"ok" => true, "number" => "+46701234567"}
    end

    test "returns 401 and clears token when Telavox returns unauthorized", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "expired-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "expired-token", _path ->
        {:error, :unauthorized}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 401) == %{"error" => "Telavox-token har gått ut"}

      # Verify token was cleared
      refreshed = Ash.get!(Saleflow.Accounts.User, user.id)
      assert is_nil(refreshed.telavox_token)
    end

    test "returns 502 on Telavox API error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "valid-token", _path ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "returns 502 on timeout error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "valid-token", _path ->
        {:error, :timeout}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/calls/dial", %{"lead_id" => Ecto.UUID.generate()})

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/calls/hangup
  # -------------------------------------------------------------------------

  describe "POST /api/calls/hangup" do
    test "returns 422 when user has no telavox_token", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 422) == %{"error" => "Inte kopplad till Telavox"}
    end

    test "returns 422 when user has empty telavox_token", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "")

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 422) == %{"error" => "Inte kopplad till Telavox"}
    end

    test "returns 200 on successful hangup", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:ok, %{"status" => "ok"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 200) == %{"ok" => true}
    end

    test "returns 200 with message when no call to hangup (bad_request)", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, {:bad_request, "No active call"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 200) == %{
               "ok" => true,
               "message" => "Inget samtal att lägga på"
             }
    end

    test "returns 401 and clears token when Telavox returns unauthorized", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "expired-token")

      MockClient
      |> expect(:post_as, fn "expired-token", "/hangup" ->
        {:error, :unauthorized}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 401) == %{"error" => "Telavox-token har gått ut"}

      # Verify token was cleared
      refreshed = Ash.get!(Saleflow.Accounts.User, user.id)
      assert is_nil(refreshed.telavox_token)
    end

    test "returns 502 on Telavox API error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "returns 502 on timeout error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, :timeout}
      end)

      conn = post(conn, "/api/calls/hangup")

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/calls/hangup")

      assert json_response(conn, 401)
    end
  end
end
