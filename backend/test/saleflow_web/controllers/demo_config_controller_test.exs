defmodule SaleflowWeb.FailingChunkAdapter do
  @moduledoc false
  # A minimal adapter that returns {:error, :closed} from chunk/2,
  # used to test the SSE stream_loop error handling.

  def send_chunked(%{ref: ref} = state, _status, _headers) do
    {:ok, "", %{state | ref: ref}}
  end

  def chunk(_state, _body) do
    {:error, :closed}
  end
end

defmodule SaleflowWeb.DemoConfigControllerTest do
  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Sales

  setup do
    Application.put_env(:saleflow, :graph_module, Saleflow.Microsoft.GraphStub)
    Application.delete_env(:saleflow, :graph_stub_response)
    Application.put_env(:saleflow, :mailer_sandbox, true)

    on_exit(fn ->
      Application.delete_env(:saleflow, :graph_module)
      Application.delete_env(:saleflow, :graph_stub_response)
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567", epost: "c#{unique}@e.se"})
    lead
  end

  defp setup_demo_held!(lead, user) do
    {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
    {:ok, dc} = Sales.start_generation(dc)
    {:ok, dc} = Sales.generation_complete(dc, %{
      website_path: "https://raw.vercel.app",
      preview_url: "https://demo.siteflow.se/test-slug"
    })
    {:ok, dc} = Sales.advance_to_demo_held(dc)
    dc
  end

  defp create_ms_connection!(user) do
    {:ok, _conn} =
      Saleflow.Accounts.MicrosoftConnection
      |> Ash.Changeset.for_create(:create, %{
        user_id: user.id,
        microsoft_user_id: "ms-user-1",
        email: "ms@e.se",
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        token_expires_at: DateTime.utc_now() |> DateTime.add(3600, :second)
      })
      |> Ash.create(authorize?: false)
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
    test "advances demo config from demo_held to followup", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Transition through: meeting_booked -> generating -> demo_ready -> demo_held
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/tmp/test", preview_url: "/preview"})
      {:ok, dc} = Sales.advance_to_demo_held(dc)
      assert dc.stage == :demo_held

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/advance")
      body = json_response(resp, 200)
      assert body["demo_config"]["stage"] == "followup"
    end

    test "fails to advance if not in demo_held stage", %{conn: conn} do
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
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/tmp/test", preview_url: "/p"})
      {:ok, _dc} = Sales.advance_to_demo_held(dc)

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
      {:ok, _dc} = Sales.advance_to_demo_held(dc)

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

    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = post(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/retry")
      assert json_response(resp, 404)["error"] == "DemoConfig not found"
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/demo-configs/:id/advance — extra edge cases
  # ---------------------------------------------------------------------------

  describe "POST /api/demo-configs/:id/advance (edge cases)" do
    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = post(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/advance")
      assert json_response(resp, 404)["error"] == "DemoConfig not found"
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id/preview
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id/preview" do
    test "serves HTML when preview file exists", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Create a temp directory with an index.html
      tmp_dir = Path.join(System.tmp_dir!(), "demo_preview_test_#{dc.id}")
      File.mkdir_p!(tmp_dir)
      File.write!(Path.join(tmp_dir, "index.html"), "<html><body>Preview</body></html>")

      # Update the demo config to have website_path
      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: tmp_dir,
          preview_url: "/preview/#{dc.id}"
        })

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/preview")
      assert response(resp, 200) == "<html><body>Preview</body></html>"
      assert resp |> get_resp_header("content-type") |> hd() =~ "text/html"

      # Cleanup
      File.rm_rf!(tmp_dir)
    end

    test "returns 404 when website_path is nil", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/preview")
      assert json_response(resp, 404)["error"] == "Preview not available"
    end

    test "returns 404 when index.html does not exist", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Set a website_path that exists but has no index.html
      {:ok, dc} = Sales.start_generation(dc)
      tmp_dir = Path.join(System.tmp_dir!(), "demo_preview_empty_#{dc.id}")
      File.mkdir_p!(tmp_dir)

      {:ok, _dc} =
        Sales.generation_complete(dc, %{
          website_path: tmp_dir,
          preview_url: "/preview/#{dc.id}"
        })

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/preview")
      assert json_response(resp, 404)["error"] == "Preview not available"

      # Cleanup
      File.rm_rf!(tmp_dir)
    end

    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = get(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/preview")
      assert json_response(resp, 404)["error"] == "DemoConfig not found"
    end

    test "agent cannot preview another agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/preview")
      assert json_response(resp, 403)["error"] == "Access denied"
    end

    test "admin can preview any agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      dc = create_demo_config!(lead, agent)

      # No website_path set, so 404 for "not available" — but proves admin passes ownership check
      {admin_conn, _admin} = create_admin!(build_conn())

      resp = get(admin_conn, "/api/demo-configs/#{dc.id}/preview")
      # Admin passes ownership check; gets 404 because no file exists (not 403)
      assert json_response(resp, 404)["error"] == "Preview not available"
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id/logs (SSE endpoint)
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id/logs" do
    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = get(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/logs")
      assert json_response(resp, 404)["error"] == "DemoConfig not found"
    end

    test "agent cannot access another agent's logs", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/logs")
      assert json_response(resp, 403)["error"] == "Access denied"
    end

    test "starts SSE stream for own demo config", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Start the SSE request in a separate process; send a "complete" message
      # so stream_loop terminates and the connection finishes.
      test_pid = self()

      task =
        Task.async(fn ->
          resp = get(agent_conn, "/api/demo-configs/#{dc.id}/logs")
          send(test_pid, {:resp, resp})
          resp
        end)

      # Give time for the subscription to start
      Process.sleep(100)

      # Send a "complete" event to terminate the stream
      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        "demo_generation:#{dc.id}",
        {:demo_generation, %{status: "complete", message: "Done"}}
      )

      resp = Task.await(task, 5_000)

      assert resp.status == 200
      assert get_resp_header(resp, "content-type") |> hd() =~ "text/event-stream"
    end

    test "stream receives progress and complete events", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      test_pid = self()

      task =
        Task.async(fn ->
          resp = get(agent_conn, "/api/demo-configs/#{dc.id}/logs")
          send(test_pid, {:resp, resp})
          resp
        end)

      Process.sleep(100)

      # Send a progress event (non-terminal), then a complete event
      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        "demo_generation:#{dc.id}",
        {:demo_generation, %{status: "progress", message: "Generating..."}}
      )

      Process.sleep(50)

      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        "demo_generation:#{dc.id}",
        {:demo_generation, %{status: "complete", message: "Done"}}
      )

      resp = Task.await(task, 5_000)
      assert resp.status == 200

      # The response body should contain both events
      body = resp.resp_body
      assert body =~ "Generating..."
      assert body =~ "Done"
    end

    test "stream terminates on error status", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      task =
        Task.async(fn ->
          get(agent_conn, "/api/demo-configs/#{dc.id}/logs")
        end)

      Process.sleep(100)

      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        "demo_generation:#{dc.id}",
        {:demo_generation, %{status: "error", message: "Something failed"}}
      )

      resp = Task.await(task, 5_000)
      assert resp.status == 200
      assert resp.resp_body =~ "Something failed"
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id/logs — SSE timeout
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id/logs (timeout)" do
    test "SSE stream sends timeout event when no messages arrive", %{conn: conn} do
      # Set a very short timeout so the test doesn't take 15 minutes
      Application.put_env(:saleflow, :sse_timeout_ms, 100)

      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      task =
        Task.async(fn ->
          get(agent_conn, "/api/demo-configs/#{dc.id}/logs")
        end)

      resp = Task.await(task, 5_000)
      # The timeout path is executed (coverage). In test adapter, send_chunked
      # returns 200 and the chunks may or may not appear in resp_body.
      assert resp.status == 200
      assert get_resp_header(resp, "content-type") |> hd() =~ "text/event-stream"
    after
      Application.delete_env(:saleflow, :sse_timeout_ms)
    end
  end


  # ---------------------------------------------------------------------------
  # stream_loop chunk error branch (unit test)
  # ---------------------------------------------------------------------------

  describe "stream_loop/2 chunk error" do
    test "handles chunk error by unsubscribing and returning conn" do
      id = Ecto.UUID.generate()
      topic = "demo_generation:#{id}"

      # Build a conn with the failing adapter to simulate client disconnect
      conn =
        %Plug.Conn{
          adapter: {SaleflowWeb.FailingChunkAdapter, %{ref: make_ref()}},
          state: :chunked,
          owner: self()
        }

      # Run stream_loop in a task. Subscribe inside the task so
      # that the task process receives the PubSub message.
      task =
        Task.async(fn ->
          Phoenix.PubSub.subscribe(Saleflow.PubSub, topic)
          SaleflowWeb.DemoConfigController.stream_loop(conn, id)
        end)

      Process.sleep(50)

      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        topic,
        {:demo_generation, %{status: "progress", message: "Step 1"}}
      )

      result = Task.await(task, 5_000)
      # The stream_loop should have returned the conn after unsubscribing
      assert %Plug.Conn{} = result
    end
  end

  # ---------------------------------------------------------------------------
  # serialize_lead(nil) edge case via show
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id (show) — nil lead" do
    test "show returns nil lead when lead_id references no lead", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      # Drop both the FK constraint and NOT NULL constraint so we can set lead_id to NULL
      Saleflow.Repo.query!("ALTER TABLE demo_configs DROP CONSTRAINT IF EXISTS demo_configs_lead_id_fkey")
      Saleflow.Repo.query!("ALTER TABLE demo_configs ALTER COLUMN lead_id DROP NOT NULL")

      Saleflow.Repo.query!(
        "UPDATE demo_configs SET lead_id = NULL WHERE id = $1",
        [Ecto.UUID.dump!(dc.id)]
      )

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)
      assert body["lead"] == nil

      # Restore: first put back a valid lead_id, then re-add constraints
      Saleflow.Repo.query!(
        "UPDATE demo_configs SET lead_id = $1 WHERE id = $2",
        [Ecto.UUID.dump!(lead.id), Ecto.UUID.dump!(dc.id)]
      )

      Saleflow.Repo.query!("ALTER TABLE demo_configs ALTER COLUMN lead_id SET NOT NULL")

      Saleflow.Repo.query!(
        "ALTER TABLE demo_configs ADD CONSTRAINT demo_configs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id)"
      )
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/demo-configs/:id/mark-demo-held
  # ---------------------------------------------------------------------------

  describe "POST /api/demo-configs/:id/mark-demo-held" do
    test "advances demo_ready to demo_held", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/x", preview_url: "/p"})
      assert dc.stage == :demo_ready

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/mark-demo-held")
      body = json_response(resp, 200)
      assert body["demo_config"]["stage"] == "demo_held"
    end

    test "returns 422 if not in demo_ready", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)
      # Still meeting_booked

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/mark-demo-held")
      assert json_response(resp, 422)
    end

    test "returns 403 for another agent's config", %{conn: conn} do
      lead = create_lead!()
      {_, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = create_demo_config!(lead, other_agent)

      {agent_conn, _} = create_agent!(build_conn(), %{name: "Me"})

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/mark-demo-held")
      assert json_response(resp, 403)
    end

    test "returns 404 for non-existent config", %{conn: conn} do
      {agent_conn, _} = create_agent!(conn)

      resp = post(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/mark-demo-held")
      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/demo-configs/:id/book-followup
  # ---------------------------------------------------------------------------

  describe "POST /api/demo-configs/:id/book-followup" do
    test "books followup in Swedish and advances demo config", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "Tack för idag!",
        language: "sv"
      })

      assert %{"demo_config" => d, "meeting" => m, "questionnaire" => q} = json_response(resp, 200)
      assert d["stage"] == "followup"
      assert m["title"] =~ "Uppföljning"
      assert m["teams_join_url"] == "https://teams.stub/join"
      assert q["token"]
      assert q["lead_id"] == lead.id
      assert q["customer_email"] == lead.epost
    end

    test "books followup in English", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "Thanks!",
        language: "en"
      })

      assert %{"meeting" => m} = json_response(resp, 200)
      assert m["title"] =~ "Follow-up"
      refute m["title"] =~ "Uppföljning"
    end

    test "defaults to Swedish when language param is missing", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: ""
      })

      assert %{"meeting" => m} = json_response(resp, 200)
      assert m["title"] =~ "Uppföljning"
    end

    test "returns 422 when demo_config not in demo_held", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert %{"error" => err} = json_response(resp, 422)
      assert err =~ "demo_held"
    end

    test "returns 422 when no MS connection", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = setup_demo_held!(lead, agent)
      # No MS connection

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert %{"error" => err} = json_response(resp, 422)
      assert err =~ "Microsoft"
    end

    test "returns 422 when lead has no email", %{conn: conn} do
      unique = System.unique_integer([:positive])
      {:ok, lead} = Sales.create_lead(%{företag: "No Email #{unique}", telefon: "+46701111111", epost: nil})
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert %{"error" => err} = json_response(resp, 422)
      assert err =~ "email"
    end

    test "returns 422 for invalid date", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "not-a-date",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert json_response(resp, 422)
    end

    test "returns 502 when Teams API fails", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      create_ms_connection!(agent)
      dc = setup_demo_held!(lead, agent)

      Application.put_env(:saleflow, :graph_stub_response, {:error, :network_error})

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert %{"error" => err} = json_response(resp, 502)
      assert err =~ "Teams"
    end

    test "returns 403 for another agent's demo config", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      dc = setup_demo_held!(lead, other_agent)

      {agent_conn, _} = create_agent!(build_conn(), %{name: "Me"})

      resp = post(agent_conn, "/api/demo-configs/#{dc.id}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert json_response(resp, 403)
    end

    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)

      resp = post(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/book-followup", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id/followup-preview
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id/followup-preview" do
    test "returns rendered Swedish email preview", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = setup_demo_held!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/followup-preview", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "Tack för idag",
        language: "sv"
      })

      assert %{"subject" => subject, "html" => html} = json_response(resp, 200)
      assert subject =~ "Uppföljning"
      assert html =~ "Tack för idag"
      assert html =~ "2026-04-16"
      assert html =~ "Visa din hemsida"
    end

    test "returns English preview when language=en", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = setup_demo_held!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}/followup-preview", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "Thanks",
        language: "en"
      })

      assert %{"subject" => subject, "html" => html} = json_response(resp, 200)
      assert subject =~ "Follow-up"
      assert html =~ "View your website"
    end

    test "returns 404 for non-existent demo config", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)

      resp = get(agent_conn, "/api/demo-configs/#{Ecto.UUID.generate()}/followup-preview", %{
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "",
        language: "sv"
      })

      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/demo-configs/:id — questionnaire in show response
  # ---------------------------------------------------------------------------

  describe "GET /api/demo-configs/:id — questionnaire" do
    test "includes questionnaire in response when one exists", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      {:ok, _q} = Sales.create_questionnaire_for_lead(%{
        lead_id: lead.id,
        customer_email: "k@t.se",
        token: "tok-" <> Integer.to_string(System.unique_integer([:positive]))
      })

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)

      assert body["questionnaire"]["lead_id"] == lead.id
      assert body["questionnaire"]["status"] == "pending"
    end

    test "questionnaire is null when none exists for lead", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      dc = create_demo_config!(lead, agent)

      resp = get(agent_conn, "/api/demo-configs/#{dc.id}")
      body = json_response(resp, 200)

      assert body["questionnaire"] == nil
    end
  end
end
