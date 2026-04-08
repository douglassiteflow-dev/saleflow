defmodule Saleflow.Workers.DemoGenerationWorkerTest do
  @moduledoc """
  Tests for DemoGenerationWorker — 100% coverage.

  Uses Mox to mock the ClaudeRunner behaviour so no external CLI is spawned.
  """

  use Saleflow.DataCase, async: false

  import Mox

  alias Saleflow.Workers.DemoGenerationWorker
  alias Saleflow.Workers.DemoGeneration.MockRunner
  alias Saleflow.Sales

  setup :verify_on_exit!

  setup do
    Application.put_env(:saleflow, :demo_generation_runner, MockRunner)

    on_exit(fn ->
      Application.delete_env(:saleflow, :demo_generation_runner)
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "demogen#{unique}@test.se",
        name: "Demo Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "DemoTest AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_demo_config!(opts \\ []) do
    lead = Keyword.get_lazy(opts, :lead, fn -> create_lead!() end)
    user = Keyword.get_lazy(opts, :user, fn -> create_user!() end)

    {:ok, dc} =
      Sales.create_demo_config(%{
        lead_id: lead.id,
        user_id: user.id,
        source_url: Keyword.get(opts, :source_url, "https://example.se")
      })

    dc
  end

  defp create_deal!(lead, user) do
    {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
    deal
  end

  defp create_meeting!(lead, user, opts \\ []) do
    params =
      %{
        lead_id: lead.id,
        user_id: user.id,
        title: "Test Meeting",
        meeting_date: ~D[2026-05-01],
        meeting_time: ~T[10:00:00]
      }
      |> Map.merge(Map.new(opts))

    {:ok, meeting} = Sales.create_meeting(params)
    meeting
  end

  defp build_job(demo_config_id) do
    %Oban.Job{args: %{"demo_config_id" => demo_config_id}}
  end

  # ---------------------------------------------------------------------------
  # Tests for build_brief/2
  # ---------------------------------------------------------------------------

  describe "build_brief/2" do
    test "replaces placeholders in template" do
      dc = create_demo_config!(source_url: "https://testforetag.se")
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      assert brief =~ dc.source_url
      assert brief =~ "/tmp/test-output"
      refute brief =~ "$SOURCE_URL"
      refute brief =~ "$OUTPUT_DIR"
    end

    test "handles nil source_url by replacing with empty string" do
      dc = create_demo_config!(source_url: nil)
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      refute brief =~ "$SOURCE_URL"
      assert brief =~ "/tmp/test-output"
    end

    test "preserves rest of template content" do
      dc = create_demo_config!(source_url: "https://testforetag.se")
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      assert brief =~ "Demo-hemsida Brief"
      assert brief =~ "index.html"
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for output_dir/1
  # ---------------------------------------------------------------------------

  describe "output_dir/1" do
    test "returns path based on demo config id" do
      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ dc.id
    end

    test "uses default base directory" do
      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ "priv/static/demos"
    end

    test "uses configured base directory when set" do
      original = Application.get_env(:saleflow, :demo_generation_dir)
      Application.put_env(:saleflow, :demo_generation_dir, "/custom/demos")

      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ "/custom/demos"
      assert dir =~ dc.id

      if original do
        Application.put_env(:saleflow, :demo_generation_dir, original)
      else
        Application.delete_env(:saleflow, :demo_generation_dir)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for broadcast/2
  # ---------------------------------------------------------------------------

  describe "broadcast/2" do
    test "broadcasts to the correct PubSub topic" do
      id = "test-broadcast-id"
      topic = "demo_generation:#{id}"
      Phoenix.PubSub.subscribe(Saleflow.PubSub, topic)

      DemoGenerationWorker.broadcast(id, %{status: "complete"})

      assert_receive {:demo_generation, %{status: "complete"}}
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns error when DemoConfig not found" do
      fake_id = Ecto.UUID.generate()
      job = build_job(fake_id)

      assert {:error, %Ash.Error.Invalid{}} = DemoGenerationWorker.perform(job)
    end

    test "returns error when start_generation fails (wrong stage)" do
      dc = create_demo_config!()

      # Transition to generating first, then to demo_ready — start_generation
      # requires :meeting_booked stage
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/tmp", preview_url: "/tmp"})

      job = build_job(dc.id)

      assert {:error, %Ash.Error.Invalid{}} = DemoGenerationWorker.perform(job)
    end

    test "success path: CLI succeeds and site/index.html exists" do
      dc = create_demo_config!()
      out_dir = DemoGenerationWorker.output_dir(dc)

      # Pre-create the site directory with index.html so the file check passes
      site_dir = Path.join(out_dir, "site")
      File.mkdir_p!(site_dir)
      File.write!(Path.join(site_dir, "index.html"), "<html>test</html>")

      # Subscribe to PubSub to verify broadcasts
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{dc.id}")

      # Mock the runner to return success
      MockRunner
      |> expect(:run, fn _brief_path, _id -> {:ok, "generated output"} end)

      job = build_job(dc.id)
      assert :ok = DemoGenerationWorker.perform(job)

      # Verify broadcast was sent
      assert_receive {:demo_generation, %{status: "complete", website_path: website_path}}
      assert website_path =~ "site"

      # Verify the demo config was updated
      {:ok, updated_dc} = Sales.get_demo_config(dc.id)
      assert updated_dc.stage == :demo_ready
      assert updated_dc.website_path =~ "site"

      # Cleanup
      File.rm_rf!(out_dir)
    end

    test "error path: CLI succeeds but site/index.html missing" do
      dc = create_demo_config!()
      out_dir = DemoGenerationWorker.output_dir(dc)

      # Subscribe to PubSub
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{dc.id}")

      # Mock the runner to return success (but we don't create the site dir)
      MockRunner
      |> expect(:run, fn _brief_path, _id -> {:ok, "generated output"} end)

      job = build_job(dc.id)
      assert {:error, "Generation finished but site/index.html not found"} = DemoGenerationWorker.perform(job)

      # Verify error broadcast was sent
      assert_receive {:demo_generation, %{status: "error", error: error_msg}}
      assert error_msg =~ "site/index.html not found"

      # Verify the demo config recorded the error
      {:ok, updated_dc} = Sales.get_demo_config(dc.id)
      assert updated_dc.error =~ "site/index.html not found"

      # Cleanup
      File.rm_rf!(out_dir)
    end

    test "error path: CLI fails with error" do
      dc = create_demo_config!()
      out_dir = DemoGenerationWorker.output_dir(dc)

      # Subscribe to PubSub
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{dc.id}")

      # Mock the runner to return an error
      MockRunner
      |> expect(:run, fn _brief_path, _id -> {:error, "exit code 1"} end)

      job = build_job(dc.id)
      assert {:error, "Claude CLI failed: exit code 1"} = DemoGenerationWorker.perform(job)

      # Verify error broadcast was sent
      assert_receive {:demo_generation, %{status: "error", error: error_msg}}
      assert error_msg =~ "Claude CLI failed"

      # Verify the demo config recorded the error
      {:ok, updated_dc} = Sales.get_demo_config(dc.id)
      assert updated_dc.error =~ "Claude CLI failed"

      # Cleanup
      File.rm_rf!(out_dir)
    end

    test "writes brief.md to the output directory" do
      dc = create_demo_config!(source_url: "https://brief-test.se")
      out_dir = DemoGenerationWorker.output_dir(dc)

      # Mock the runner — we just want to verify brief was written
      MockRunner
      |> expect(:run, fn brief_path, _id ->
        # Verify the brief file exists and has correct content
        content = File.read!(brief_path)
        assert content =~ "https://brief-test.se"
        assert content =~ out_dir
        {:error, "test abort"}
      end)

      job = build_job(dc.id)
      # Will fail because of mock error, but brief should have been written
      DemoGenerationWorker.perform(job)

      # Verify brief was written
      brief_path = Path.join(out_dir, "brief.md")
      assert File.exists?(brief_path)
      content = File.read!(brief_path)
      assert content =~ "https://brief-test.se"

      # Cleanup
      File.rm_rf!(out_dir)
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for maybe_advance_deal/1
  # ---------------------------------------------------------------------------

  describe "maybe_advance_deal/1" do
    test "advances deal from booking_wizard to demo_scheduled and sets website_url" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      dc = create_demo_config!(lead: lead, user: user)

      # Link meeting to both deal and demo_config
      _meeting = create_meeting!(lead, user, deal_id: deal.id, demo_config_id: dc.id)

      # Manually transition demo_config to demo_ready with a preview_url
      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: "/tmp/test-site",
          preview_url: "/demos/#{dc.id}/site/index.html"
        })

      assert dc.stage == :demo_ready
      assert deal.stage == :booking_wizard

      # Call maybe_advance_deal directly
      assert :ok = DemoGenerationWorker.maybe_advance_deal(dc)

      # Assert deal is now at demo_scheduled with the correct website_url
      {:ok, updated_deal} = Sales.get_deal(deal.id)
      assert updated_deal.stage == :demo_scheduled
      assert updated_deal.website_url == "/demos/#{dc.id}/site/index.html"
    end

    test "no-op when no meetings linked to demo_config" do
      lead = create_lead!()
      user = create_user!()
      dc = create_demo_config!(lead: lead, user: user)

      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: "/tmp/test-site",
          preview_url: "/demos/#{dc.id}/site/index.html"
        })

      # No meeting created — should be a no-op
      assert :ok = DemoGenerationWorker.maybe_advance_deal(dc)
    end

    test "no-op when meeting has no deal_id" do
      lead = create_lead!()
      user = create_user!()
      dc = create_demo_config!(lead: lead, user: user)

      # Meeting linked to demo_config but no deal_id
      _meeting = create_meeting!(lead, user, demo_config_id: dc.id)

      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: "/tmp/test-site",
          preview_url: "/demos/#{dc.id}/site/index.html"
        })

      assert :ok = DemoGenerationWorker.maybe_advance_deal(dc)
    end

    test "no-op when deal is not at booking_wizard" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)

      # Advance deal past booking_wizard
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :demo_scheduled

      dc = create_demo_config!(lead: lead, user: user)
      _meeting = create_meeting!(lead, user, deal_id: deal.id, demo_config_id: dc.id)

      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: "/tmp/test-site",
          preview_url: "/demos/#{dc.id}/site/index.html"
        })

      assert :ok = DemoGenerationWorker.maybe_advance_deal(dc)

      # Deal should remain at demo_scheduled, not advance further
      {:ok, unchanged_deal} = Sales.get_deal(deal.id)
      assert unchanged_deal.stage == :demo_scheduled
    end
  end
end
