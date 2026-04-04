defmodule SaleflowWeb.AppControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts

  @admin_params %{
    email: "admin-apps@example.com",
    name: "Admin User",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agent-apps@example.com",
    name: "Agent User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)

    {:ok, app} =
      Saleflow.Apps.App
      |> Ash.Changeset.for_create(:create, %{
        slug: "testapp",
        name: "Test App",
        description: "Test",
        active: false
      })
      |> Ash.create()

    %{conn: conn, admin: admin, agent: agent, app: app}
  end

  # ---------------------------------------------------------------------------
  # GET /api/apps (my_apps — agent endpoint)
  # ---------------------------------------------------------------------------

  describe "GET /api/apps (my_apps)" do
    test "agent with no permissions gets empty list", %{conn: conn, agent: agent} do
      # Activate the app so it would show up if the agent had permission
      activate_app("testapp")

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/apps")

      assert %{"apps" => []} = json_response(conn, 200)
    end

    test "agent with permission on active app sees it", %{conn: conn, agent: agent, app: app} do
      activate_app("testapp")
      grant_permission(app.id, agent.id)

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/apps")

      assert %{"apps" => [returned_app]} = json_response(conn, 200)
      assert returned_app["slug"] == "testapp"
      assert returned_app["active"] == true
    end

    test "agent does not see inactive apps even with permission", %{conn: conn, agent: agent, app: app} do
      grant_permission(app.id, agent.id)

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/apps")

      assert %{"apps" => []} = json_response(conn, 200)
    end

    test "admin sees all active apps", %{conn: conn, admin: admin} do
      activate_app("testapp")

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/apps")

      assert %{"apps" => apps} = json_response(conn, 200)
      assert length(apps) >= 1
      slugs = Enum.map(apps, & &1["slug"])
      assert "testapp" in slugs
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/apps")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/admin/apps (index)
  # ---------------------------------------------------------------------------

  describe "GET /api/admin/apps" do
    test "returns all apps with agent_count", %{conn: conn, admin: admin, app: app, agent: agent} do
      grant_permission(app.id, agent.id)

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/apps")

      assert %{"apps" => apps} = json_response(conn, 200)
      test_app = Enum.find(apps, &(&1["slug"] == "testapp"))
      assert test_app
      assert test_app["agent_count"] == 1
    end

    test "returns 403 for agent", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/admin/apps")

      assert json_response(conn, 403)
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/admin/apps")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/admin/apps/:slug (show)
  # ---------------------------------------------------------------------------

  describe "GET /api/admin/apps/:slug" do
    test "returns app detail with agents list", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/apps/testapp")

      assert %{"app" => app, "agents" => agents} = json_response(conn, 200)
      assert app["slug"] == "testapp"
      assert is_list(agents)
      assert Enum.all?(agents, &Map.has_key?(&1, "has_access"))
    end

    test "returns 404 for unknown slug", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/apps/nonexistent")

      assert json_response(conn, 404)
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/admin/apps/testapp")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/admin/apps/:slug/toggle
  # ---------------------------------------------------------------------------

  describe "POST /api/admin/apps/:slug/toggle" do
    test "toggles active from false to true", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/apps/testapp/toggle")

      assert %{"app" => app} = json_response(conn, 200)
      assert app["active"] == true
    end

    test "toggles active from true to false", %{conn: conn, admin: admin} do
      activate_app("testapp")

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/apps/testapp/toggle")

      assert %{"app" => app} = json_response(conn, 200)
      assert app["active"] == false
    end

    test "returns 404 for unknown slug", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/apps/nonexistent/toggle")

      assert json_response(conn, 404)
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/admin/apps/testapp/toggle")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/admin/apps/:slug/permissions
  # ---------------------------------------------------------------------------

  describe "POST /api/admin/apps/:slug/permissions" do
    test "grants agent access", %{conn: conn, admin: admin, agent: agent} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/apps/testapp/permissions", %{"user_id" => agent.id})

      assert %{"ok" => true} = json_response(conn, 201)
    end

    test "returns 404 for unknown slug", %{conn: conn, admin: admin, agent: agent} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/apps/nonexistent/permissions", %{"user_id" => agent.id})

      assert json_response(conn, 404)
    end

    test "requires authentication", %{conn: conn, agent: agent} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/admin/apps/testapp/permissions", %{"user_id" => agent.id})

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/admin/apps/:slug/permissions/:user_id
  # ---------------------------------------------------------------------------

  describe "DELETE /api/admin/apps/:slug/permissions/:user_id" do
    test "revokes agent access", %{conn: conn, admin: admin, agent: agent, app: app} do
      grant_permission(app.id, agent.id)

      conn =
        conn
        |> log_in_user(admin)
        |> delete("/api/admin/apps/testapp/permissions/#{agent.id}")

      assert %{"ok" => true} = json_response(conn, 200)

      # Verify permission was actually removed
      {:ok, permissions} =
        Saleflow.Apps.AppPermission
        |> Ash.Query.for_read(:for_app, %{app_id: app.id})
        |> Ash.read()

      assert Enum.empty?(permissions)
    end

    test "returns 404 for unknown slug", %{conn: conn, admin: admin, agent: agent} do
      conn =
        conn
        |> log_in_user(admin)
        |> delete("/api/admin/apps/nonexistent/permissions/#{agent.id}")

      assert json_response(conn, 404)
    end

    test "requires authentication", %{conn: conn, agent: agent} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> delete("/api/admin/apps/testapp/permissions/#{agent.id}")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp activate_app(slug) do
    {:ok, app} =
      Saleflow.Apps.App
      |> Ash.Query.for_read(:by_slug, %{slug: slug})
      |> Ash.read_one()

    app
    |> Ash.Changeset.for_update(:toggle, %{active: true})
    |> Ash.update()
  end

  defp grant_permission(app_id, user_id) do
    {:ok, _} =
      Saleflow.Apps.AppPermission
      |> Ash.Changeset.for_create(:create, %{app_id: app_id, user_id: user_id})
      |> Ash.create()
  end
end
