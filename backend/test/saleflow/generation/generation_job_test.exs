defmodule Saleflow.Generation.GenerationJobTest do
  @moduledoc """
  Tests for the GenerationJob Ash resource and the Generation domain functions.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Generation

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp valid_params(overrides \\ %{}) do
    Map.merge(
      %{
        source_url: "https://example.se",
        slug: "example-se"
      },
      overrides
    )
  end

  # ---------------------------------------------------------------------------
  # create_job/1
  # ---------------------------------------------------------------------------

  describe "create_job/1" do
    test "creates a job with valid params and default status :pending" do
      {:ok, job} = Generation.create_job(valid_params())

      assert job.source_url == "https://example.se"
      assert job.slug == "example-se"
      assert job.status == :pending
      assert is_nil(job.result_url)
      assert is_nil(job.error)
      assert is_nil(job.picked_up_at)
      assert is_nil(job.completed_at)
      assert job.inserted_at != nil
    end

    test "creates a job with optional deal_id and demo_config_id" do
      lead = Saleflow.Factory.create_lead!()
      user = Saleflow.Factory.create_user!()
      deal = Saleflow.Factory.create_deal!(lead, user)

      {:ok, dc} =
        Saleflow.Sales.create_demo_config(%{
          lead_id: lead.id,
          user_id: user.id,
          source_url: "https://example.se"
        })

      {:ok, job} =
        Generation.create_job(valid_params(%{deal_id: deal.id, demo_config_id: dc.id}))

      assert job.deal_id == deal.id
      assert job.demo_config_id == dc.id
    end

    test "fails without required source_url" do
      assert {:error, _} = Generation.create_job(%{slug: "test"})
    end

    test "fails without required slug" do
      assert {:error, _} = Generation.create_job(%{source_url: "https://example.se"})
    end
  end

  # ---------------------------------------------------------------------------
  # get_next_pending_job/0
  # ---------------------------------------------------------------------------

  describe "get_next_pending_job/0" do
    test "returns the oldest pending job" do
      {:ok, first} = Generation.create_job(valid_params(%{slug: "first"}))
      {:ok, _second} = Generation.create_job(valid_params(%{slug: "second"}))

      {:ok, next} = Generation.get_next_pending_job()
      assert next.id == first.id
    end

    test "returns nil when no pending jobs exist" do
      {:ok, nil} = Generation.get_next_pending_job()
    end

    test "skips processing jobs" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, _picked} = Generation.pick_job(job)

      {:ok, nil} = Generation.get_next_pending_job()
    end

    test "skips completed jobs" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, picked} = Generation.pick_job(job)
      {:ok, _completed} = Generation.complete_job(picked, "https://result.se")

      {:ok, nil} = Generation.get_next_pending_job()
    end

    test "skips failed jobs" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, picked} = Generation.pick_job(job)
      {:ok, _failed} = Generation.fail_job(picked, "something broke")

      {:ok, nil} = Generation.get_next_pending_job()
    end

    test "returns pending job when other jobs are processing/completed/failed" do
      {:ok, processing_job} = Generation.create_job(valid_params(%{slug: "proc"}))
      {:ok, _} = Generation.pick_job(processing_job)

      {:ok, completed_job} = Generation.create_job(valid_params(%{slug: "comp"}))
      {:ok, picked} = Generation.pick_job(completed_job)
      {:ok, _} = Generation.complete_job(picked, "https://result.se")

      {:ok, failed_job} = Generation.create_job(valid_params(%{slug: "fail"}))
      {:ok, fpicked} = Generation.pick_job(failed_job)
      {:ok, _} = Generation.fail_job(fpicked, "error")

      {:ok, pending} = Generation.create_job(valid_params(%{slug: "pend"}))

      {:ok, next} = Generation.get_next_pending_job()
      assert next.id == pending.id
    end
  end

  # ---------------------------------------------------------------------------
  # pick_job/1
  # ---------------------------------------------------------------------------

  describe "pick_job/1" do
    test "sets status to processing and picked_up_at" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, picked} = Generation.pick_job(job)

      assert picked.status == :processing
      assert picked.picked_up_at != nil
    end
  end

  # ---------------------------------------------------------------------------
  # complete_job/2
  # ---------------------------------------------------------------------------

  describe "complete_job/2" do
    test "sets status to completed with result_url and completed_at" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, picked} = Generation.pick_job(job)
      {:ok, completed} = Generation.complete_job(picked, "https://result.example.se/site")

      assert completed.status == :completed
      assert completed.result_url == "https://result.example.se/site"
      assert completed.completed_at != nil
    end
  end

  # ---------------------------------------------------------------------------
  # fail_job/2
  # ---------------------------------------------------------------------------

  describe "fail_job/2" do
    test "sets status to failed with error and completed_at" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, picked} = Generation.pick_job(job)
      {:ok, failed} = Generation.fail_job(picked, "Claude crashed")

      assert failed.status == :failed
      assert failed.error == "Claude crashed"
      assert failed.completed_at != nil
    end
  end

  # ---------------------------------------------------------------------------
  # get_job/1
  # ---------------------------------------------------------------------------

  describe "get_job/1" do
    test "returns a job by id" do
      {:ok, job} = Generation.create_job(valid_params())
      {:ok, found} = Generation.get_job(job.id)

      assert found.id == job.id
      assert found.slug == job.slug
    end

    test "returns error for non-existent id" do
      assert {:error, _} = Generation.get_job(Ecto.UUID.generate())
    end
  end
end
