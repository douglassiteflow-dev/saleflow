defmodule SaleflowWeb.DemoConfigControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_agent!(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, Map.merge(%{name: "Agent"}, attrs))
  end

  defp create_admin!(conn) do
    {conn, user} = register_and_log_in_user(conn, %{name: "Admin"})

    Saleflow.Repo.query!(
      "UPDATE users SET role = 'admin' WHERE id = $1",
      [Ecto.UUID.dump!(user.id)]
    )

    {:ok, admin} = Ash.get(Saleflow.Accounts.User, user.id)
    {conn, admin}
  end

  defp create_demo_config!(lead, user, attrs \\ %{}) do
    params =
      Map.merge(
        %{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"},
        attrs
      )

    {:ok, dc} = Sales.create_demo_config(params)
    dc
  end

  defp create_meeting!(lead, user, opts \\ []) do
    demo_config_id = Keyword.get(opts, :demo_config_id)

    params = %{
      lead_id: lead.id,
      user_id: user.id,
      title: Keyword.get(opts, :title, "Demo Möte"),
      meeting_date: Keyword.get(opts, :meeting_date, Date.utc_today() |> Date.add(7)),
      meeting_time: Keyword.get(opts, :meeting_time, ~T[10:00:00])
    }

    params = if demo_config_id, do: Map.put(params, :demo_config_id, demo_config_id), else: params

    {:ok, meeting} = Sales.create_meeting(params)
    meeting
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs (index)
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs" do
    test "agent sees only own demo configs", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      _dc = create_demo_config!(lead, agent)

      # Another agent's config
      {_other_conn, other_agent} = create_agent!(build_conn(), %{name: "Other Agent"})
      _other_dc = create_demo_config!(create_lead!(), other_agent)

      resp = get(agent_conn, "/api/demo-configs")
      assert %{"demo_configs" => configs} = json_response(resp, 200)
      assert length(configs) == 1
      assert hd(configs)["user_id"] == agent.id
    end

    test "admin sees all demo configs", %{conn: conn} do
      lead1 = create_lead!()
      lead2 = create_lead!()
      {admin_conn, admin} = create_admin!(conn)

      {_agent_conn, agent} = create_agent!(build_conn(), %{name: "Some Agent"})
      _dc1 = create_demo_config!(lead1, agent)
      _dc2 = create_demo_config!(lead2, admin)

      resp = get(admin_conn, "/api/demo-configs")
      assert %{"demo_configs" => configs} = json_response(resp, 200)
      assert length(configs) == 2
    end

    test "demo configs include lead_name", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      _dc = create_demo_config!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs")
      assert %{"demo_configs" => [config]} = json_response(resp, 200)
      assert config["lead_name"] == lead.företag
    end

    test "demo configs include user_name", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      _dc = create_demo_config!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs")
      assert %{"demo_configs" => [config]} = json_response(resp, 200)
      assert is_binary(config["user_name"])
    end

    test "demo configs include all expected fields", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      _dc = create_demo_config!(lead, agent, %{source_url: "https://test.se"})

      resp = get(agent_conn, "/api/demo-configs")
      assert %{"demo_configs" => [config]} = json_response(resp, 200)
      assert config["id"]
      assert config["lead_id"] == lead.id
      assert config["user_id"] == agent.id
      assert config["stage"] == "meeting_booked"
      assert config["source_url"] == "https://test.se"
      assert config["inserted_at"]
      assert config["updated_at"]
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id (show)
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id" do
    test "returns demo config + lead + meetings", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      _meeting = create_meeting!(lead, agent, demo_config_id: dc.id)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)

      assert body["demo_config"]["id"] == dc.id
      assert body["lead"]["id"] == lead.id
      assert length(body["meetings"]) == 1
    end

    test "agent cannot see another agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      assert json_response(resp, 403)
    end

    test "admin can see any agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      dc = create_demo_config!(lead, agent)

      {admin_conn, _admin} = create_admin!(build_conn())

      resp = get(admin_conn, "/api/demo-configs/#{dc.id}")
      assert json_response(resp, 200)
    end

    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = get(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}")
      assert json_response(resp, 404)
    end

    test "show includes lead details", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)

      assert body["lead"]["företag"] == lead.företag
      assert body["lead"]["telefon"] == lead.telefon
    end

    test "show includes meeting details with demo_config_id", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      meeting = create_meeting!(lead, agent, demo_config_id: dc.id)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)

      [m] = body["meetings"]
      assert m["id"] == meeting.id
      assert m["demo_config_id"] == dc.id
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/demo-configs/:id/advance
  # ---------------------------------------------------------------------------

  describe "POST /api/demo-configs/:id/advance" do
    test "advances demo config from demo_ready to followup", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Transition through: meeting_booked -> generating -> demo_ready
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/tmp/test", preview_url: "/preview"})
      assert dc.stage == :demo_ready

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/advance")
      body = json_response(resp, 200)
      assert body["demo_config"]["stage"] == "followup"
    end

    test "fails to advance if not in demo_ready stage", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      assert dc.stage == :meeting_booked

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/advance")
      assert json_response(resp, 422)
    end

    test "agent cannot advance another agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, _dc} = Sales.generation_complete(dc, %{website_path: "/tmp/test", preview_url: "/p"})

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/advance")
      assert json_response(resp, 403)
    end

    test "admin can advance any demo config", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      dc = create_demo_config!(lead, agent)
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/tmp/test", preview_url: "/p"})

      {admin_conn, _admin} = create_admin!(build_conn())

      resp = post(admin_conn, "/api/demo-configs/#{dc.id}/advance")
      assert json_response(resp, 200)["demo_config"]["stage"] == "followup"
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/demo-configs/:id/retry
  # ---------------------------------------------------------------------------

  describe "POST /api/demo-configs/:id/retry" do
    test "retries generation for a failed demo config", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Move to generating and then fail it
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_failed(dc, %{error: "Something went wrong"})
      assert dc.stage == :generating
      assert dc.error == "Something went wrong"

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/retry")
      body = json_response(resp, 200)
      assert body["demo_config"]["stage"] == "generating"
      assert body["demo_config"]["error"] == nil
    end

    test "fails to retry if not in generating stage", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      assert dc.stage == :meeting_booked

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/retry")
      assert json_response(resp, 422)
    end

    test "agent cannot retry another agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, _dc} = Sales.generation_failed(dc, %{error: "Fail"})

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/retry")
      assert json_response(resp, 403)
    end

    test "admin can retry any demo config", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      dc = create_demo_config!(lead, agent)
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_failed(dc, %{error: "Fail"})

      {admin_conn, _admin} = create_admin!(build_conn())

      resp = post(admin_conn, "/api/demo-configs/#{dc.id}/retry")
      body = json_response(resp, 200)
      assert body["demo_config"]["stage"] == "generating"
      assert body["demo_config"]["error"] == nil
    end
  end
end
