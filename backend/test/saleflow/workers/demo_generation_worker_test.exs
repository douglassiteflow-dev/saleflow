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

  import Saleflow.Factory

  # ---------------------------------------------------------------------------
  # Worker-specific helpers
  # ---------------------------------------------------------------------------

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

  # ---------------------------------------------------------------------------
  # Tests for slug_from_url/1
  # ---------------------------------------------------------------------------

  describe "slug_from_url/1" do
    test "extracts last path segment from Bokadirekt URL" do
      assert DemoGenerationWorker.slug_from_url(
               "https://www.bokadirekt.se/places/sakura-relax-massage-59498"
             ) == "sakura-relax-massage-59498"
    end

    test "extracts last segment from URL with multiple path segments" do
      assert DemoGenerationWorker.slug_from_url(
               "https://www.bokadirekt.se/places/headzone-sankt-eriksplan-vasastan-36692"
             ) == "headzone-sankt-eriksplan-vasastan-36692"
    end

    test "handles trailing slash" do
      assert DemoGenerationWorker.slug_from_url("https://www.bokadirekt.se/places/acme/") ==
               "acme"
    end

    test "falls back to hostname when URL has no path" do
      assert DemoGenerationWorker.slug_from_url("https://example.se") == "example-se"
    end

    test "strips www. prefix in hostname fallback" do
      assert DemoGenerationWorker.slug_from_url("https://www.example.se") == "example-se"
    end

    test "replaces dots with hyphens in hostname fallback" do
      assert DemoGenerationWorker.slug_from_url("https://sub.example.se") == "sub-example-se"
    end

    test "sanitizes non-alphanumeric chars in path segment" do
      assert DemoGenerationWorker.slug_from_url("https://ex.se/path/with spaces") ==
               "with-spaces"
    end

    test "returns unknown for nil" do
      assert DemoGenerationWorker.slug_from_url(nil) == "unknown"
    end

    test "returns unknown for empty string" do
      assert DemoGenerationWorker.slug_from_url("") == "unknown"
    end

    test "returns unknown for string without host or path" do
      assert DemoGenerationWorker.slug_from_url("not-a-url") == "unknown"
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for genflow job queue mode
  # ---------------------------------------------------------------------------

  describe "perform/1 with genflow jobs enabled" do
    setup do
      Application.put_env(:saleflow, :use_genflow_jobs, true)
      Application.put_env(:saleflow, :genflow_poll_interval_ms, 0)
      Application.put_env(:saleflow, :genflow_max_polls, 3)

      on_exit(fn ->
        Application.put_env(:saleflow, :use_genflow_jobs, false)
      end)

      :ok
    end

    test "creates genflow job and returns :ok immediately (fire-and-forget)" do
      dc = create_demo_config!(source_url: "https://testforetag.se")

      # Subscribe to PubSub
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{dc.id}")

      job = build_job(dc.id)
      # Fire-and-forget: worker creates job and returns immediately
      assert :ok = DemoGenerationWorker.perform(job)

      # Verify the queued broadcast was sent
      assert_receive {:demo_generation, %{status: "queued", genflow_job_id: job_id}}

      # Verify a generation_job was created in the database
      {:ok, gen_job} = Saleflow.Generation.get_job(job_id)
      assert gen_job.status == :pending
    end

    test "genflow job failure is handled by GenJobRecoveryWorker (not polling)" do
      dc = create_demo_config!(source_url: "https://testforetag.se")

      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{dc.id}")

      job = build_job(dc.id)
      assert :ok = DemoGenerationWorker.perform(job)

      # Get the created genflow job
      assert_receive {:demo_generation, %{status: "queued", genflow_job_id: job_id}}

      # Simulate genflow picking up and failing the job
      {:ok, gen_job} = Saleflow.Generation.get_job(job_id)
      {:ok, picked} = Saleflow.Generation.pick_job(gen_job)
      {:ok, failed} = Saleflow.Generation.fail_job(picked, "Build error")

      assert failed.status == :failed
      assert failed.error == "Build error"
      # GenJobRecoveryWorker will sync this back to demo_config
    end

    test "does not run local generation when genflow is enabled" do
      dc = create_demo_config!(source_url: "https://testforetag.se")

      # The MockRunner should NOT be called when genflow is enabled
      # If it were called, Mox would complain about unexpected calls

      job = build_job(dc.id)
      # Fire-and-forget: returns :ok without calling local runner
      assert :ok = DemoGenerationWorker.perform(job)
    end
  end

  describe "perform/1 with genflow jobs disabled (default)" do
    test "uses local generation when genflow is disabled" do
      # Ensure genflow is disabled (default)
      Application.put_env(:saleflow, :use_genflow_jobs, false)

      dc = create_demo_config!(source_url: "https://testforetag.se")
      out_dir = DemoGenerationWorker.output_dir(dc)

      # Mock the runner — this should be called in local mode
      MockRunner
      |> expect(:run, fn _brief_path, _id -> {:error, "test abort"} end)

      job = build_job(dc.id)
      {:error, _} = DemoGenerationWorker.perform(job)

      # Cleanup
      File.rm_rf!(out_dir)
    end
  end
end
