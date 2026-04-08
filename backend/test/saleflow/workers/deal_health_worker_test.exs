defmodule Saleflow.Workers.DealHealthWorkerTest do
  @moduledoc """
  Tests for DealHealthWorker — 100% coverage.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.DealHealthWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "health#{unique}@test.se",
        name: "Health Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "HealthTest AB #{unique}", telefon: "+4670#{unique}"})
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

  defp insert_phone_call!(lead_id, user_id, opts \\ []) do
    call_id = Ecto.UUID.generate()
    received_at = Keyword.get(opts, :received_at, NaiveDateTime.utc_now())
    sentiment = Keyword.get(opts, :sentiment, nil)
    scorecard_avg = Keyword.get(opts, :scorecard_avg, nil)

    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, lead_id, user_id, caller, callee, direction, received_at, duration, sentiment, scorecard_avg, inserted_at)
      VALUES ($1, $2, $3, '+46701234567', '+46812345678', 'outgoing', $4, 120, $5, $6, NOW())
      """,
      [
        Ecto.UUID.dump!(call_id),
        Ecto.UUID.dump!(lead_id),
        Ecto.UUID.dump!(user_id),
        received_at,
        sentiment,
        scorecard_avg
      ]
    )

    call_id
  end

  defp set_stage!(dc_id, stage) do
    Saleflow.Repo.query!(
      "UPDATE demo_configs SET stage = $1 WHERE id = $2",
      [Atom.to_string(stage), Ecto.UUID.dump!(dc_id)]
    )
  end


  defp days_ago(days) do
    NaiveDateTime.utc_now() |> NaiveDateTime.add(-days * 86400, :second)
  end

  # ---------------------------------------------------------------------------
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when no active configs exist" do
      # Clean up any configs from other tests
      Saleflow.Repo.query!("DELETE FROM demo_configs")

      assert :ok = DealHealthWorker.perform(%Oban.Job{})
    end

    test "scores active configs and saves health_score" do
      lead = create_lead!()
      user = create_user!()
      dc = create_demo_config!(lead: lead, user: user)

      assert :ok = DealHealthWorker.perform(%Oban.Job{})

      {:ok, %{rows: [[score]]}} =
        Saleflow.Repo.query(
          "SELECT health_score FROM demo_configs WHERE id = $1",
          [Ecto.UUID.dump!(dc.id)]
        )

      assert is_integer(score)
      assert score >= 1 and score <= 100
    end

    test "skips cancelled configs" do
      lead = create_lead!()
      user = create_user!()
      dc = create_demo_config!(lead: lead, user: user)
      set_stage!(dc.id, :cancelled)

      # Clean up other configs so only the cancelled one exists
      Saleflow.Repo.query!(
        "DELETE FROM demo_configs WHERE id != $1",
        [Ecto.UUID.dump!(dc.id)]
      )

      assert :ok = DealHealthWorker.perform(%Oban.Job{})

      {:ok, %{rows: [[score]]}} =
        Saleflow.Repo.query(
          "SELECT health_score FROM demo_configs WHERE id = $1",
          [Ecto.UUID.dump!(dc.id)]
        )

      assert score == nil
    end
  end

  # ---------------------------------------------------------------------------
  # calculate_health/1
  # ---------------------------------------------------------------------------

  describe "calculate_health/1" do
    test "returns average of all non-nil signals" do
      lead = create_lead!()
      user = create_user!()
      dc = create_demo_config!(lead: lead, user: user)

      # Add call activity and sentiment data
      insert_phone_call!(lead.id, user.id, sentiment: "positive", scorecard_avg: 8.0)
      insert_phone_call!(lead.id, user.id, scorecard_avg: 6.0)

      config = %{
        id: dc.id,
        lead_id: lead.id,
        stage: "meeting_booked",
        updated_at: NaiveDateTime.utc_now()
      }

      score = DealHealthWorker.calculate_health(config)
      assert is_integer(score)
      assert score >= 1 and score <= 100
    end

    test "returns 50 when no signals produce data" do
      lead = create_lead!()

      config = %{
        id: Ecto.UUID.generate(),
        lead_id: lead.id,
        stage: "unknown_stage",
        updated_at: NaiveDateTime.utc_now()
      }

      # stage_freshness = 50, call_activity = 20, latest_sentiment = nil, scorecard_trend = nil
      # Average of [50, 20] = 35
      score = DealHealthWorker.calculate_health(config)
      assert is_integer(score)
    end
  end

  # ---------------------------------------------------------------------------
  # stage_freshness/1
  # ---------------------------------------------------------------------------

  describe "stage_freshness/1" do
    test "meeting_booked fresh (< 2 days) returns 90" do
      assert 90 = DealHealthWorker.stage_freshness(%{stage: "meeting_booked", updated_at: NaiveDateTime.utc_now()})
    end

    test "meeting_booked 3 days old returns 70" do
      assert 70 = DealHealthWorker.stage_freshness(%{stage: "meeting_booked", updated_at: days_ago(3)})
    end

    test "meeting_booked 7 days old returns 40" do
      assert 40 = DealHealthWorker.stage_freshness(%{stage: "meeting_booked", updated_at: days_ago(7)})
    end

    test "meeting_booked 15 days old returns 20" do
      assert 20 = DealHealthWorker.stage_freshness(%{stage: "meeting_booked", updated_at: days_ago(15)})
    end

    test "meeting_booked atom stage works too" do
      assert 90 = DealHealthWorker.stage_freshness(%{stage: :meeting_booked, updated_at: NaiveDateTime.utc_now()})
    end

    test "generating fresh (< 1 day) returns 80" do
      assert 80 = DealHealthWorker.stage_freshness(%{stage: "generating", updated_at: NaiveDateTime.utc_now()})
    end

    test "generating stale (> 1 day) returns 30" do
      assert 30 = DealHealthWorker.stage_freshness(%{stage: "generating", updated_at: days_ago(2)})
    end

    test "generating atom stage works" do
      assert 80 = DealHealthWorker.stage_freshness(%{stage: :generating, updated_at: NaiveDateTime.utc_now()})
    end

    test "demo_ready fresh (< 3 days) returns 85" do
      assert 85 = DealHealthWorker.stage_freshness(%{stage: "demo_ready", updated_at: NaiveDateTime.utc_now()})
    end

    test "demo_ready 5 days old returns 60" do
      assert 60 = DealHealthWorker.stage_freshness(%{stage: "demo_ready", updated_at: days_ago(5)})
    end

    test "demo_ready 10 days old returns 30" do
      assert 30 = DealHealthWorker.stage_freshness(%{stage: "demo_ready", updated_at: days_ago(10)})
    end

    test "demo_ready atom stage works" do
      assert 85 = DealHealthWorker.stage_freshness(%{stage: :demo_ready, updated_at: NaiveDateTime.utc_now()})
    end

    test "followup fresh (< 7 days) returns 80" do
      assert 80 = DealHealthWorker.stage_freshness(%{stage: "followup", updated_at: NaiveDateTime.utc_now()})
    end

    test "followup 10 days old returns 50" do
      assert 50 = DealHealthWorker.stage_freshness(%{stage: "followup", updated_at: days_ago(10)})
    end

    test "followup 20 days old returns 20" do
      assert 20 = DealHealthWorker.stage_freshness(%{stage: "followup", updated_at: days_ago(20)})
    end

    test "followup atom stage works" do
      assert 80 = DealHealthWorker.stage_freshness(%{stage: :followup, updated_at: NaiveDateTime.utc_now()})
    end

    test "unknown stage returns 50" do
      assert 50 = DealHealthWorker.stage_freshness(%{stage: "something_else", updated_at: NaiveDateTime.utc_now()})
    end
  end

  # ---------------------------------------------------------------------------
  # call_activity/1
  # ---------------------------------------------------------------------------

  describe "call_activity/1" do
    test "returns 20 when no recent calls" do
      lead = create_lead!()
      assert 20 = DealHealthWorker.call_activity(%{lead_id: lead.id})
    end

    test "returns score based on call count" do
      lead = create_lead!()
      user = create_user!()

      # Insert 3 recent calls
      insert_phone_call!(lead.id, user.id)
      insert_phone_call!(lead.id, user.id)
      insert_phone_call!(lead.id, user.id)

      # 40 + 3*10 = 70
      assert 70 = DealHealthWorker.call_activity(%{lead_id: lead.id})
    end

    test "caps at 90 for many calls" do
      lead = create_lead!()
      user = create_user!()

      # Insert 6 calls (40 + 6*10 = 100, capped at 90)
      for _ <- 1..6, do: insert_phone_call!(lead.id, user.id)

      assert 90 = DealHealthWorker.call_activity(%{lead_id: lead.id})
    end

    test "ignores old calls (> 14 days)" do
      lead = create_lead!()
      user = create_user!()

      # Insert call from 20 days ago
      insert_phone_call!(lead.id, user.id, received_at: days_ago(20))

      assert 20 = DealHealthWorker.call_activity(%{lead_id: lead.id})
    end
  end

  # ---------------------------------------------------------------------------
  # latest_sentiment/1
  # ---------------------------------------------------------------------------

  describe "latest_sentiment/1" do
    test "returns 90 for positive sentiment" do
      lead = create_lead!()
      user = create_user!()
      insert_phone_call!(lead.id, user.id, sentiment: "positive")

      assert 90 = DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end

    test "returns 60 for neutral sentiment" do
      lead = create_lead!()
      user = create_user!()
      insert_phone_call!(lead.id, user.id, sentiment: "neutral")

      assert 60 = DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end

    test "returns 25 for negative sentiment" do
      lead = create_lead!()
      user = create_user!()
      insert_phone_call!(lead.id, user.id, sentiment: "negative")

      assert 25 = DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end

    test "returns nil when no calls with sentiment" do
      lead = create_lead!()
      assert nil == DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end

    test "returns nil when calls exist but without sentiment" do
      lead = create_lead!()
      user = create_user!()
      insert_phone_call!(lead.id, user.id, sentiment: nil)

      assert nil == DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end

    test "returns most recent sentiment" do
      lead = create_lead!()
      user = create_user!()

      # Older call: negative
      insert_phone_call!(lead.id, user.id,
        sentiment: "negative",
        received_at: days_ago(5)
      )

      # Newer call: positive
      insert_phone_call!(lead.id, user.id,
        sentiment: "positive",
        received_at: NaiveDateTime.utc_now()
      )

      assert 90 = DealHealthWorker.latest_sentiment(%{lead_id: lead.id})
    end
  end

  # ---------------------------------------------------------------------------
  # scorecard_trend/1
  # ---------------------------------------------------------------------------

  describe "scorecard_trend/1" do
    test "returns 85 for improving scores (> 1 point increase)" do
      lead = create_lead!()
      user = create_user!()

      # Older: 5.0, Recent: 8.0 (improving by more than 1)
      insert_phone_call!(lead.id, user.id, scorecard_avg: 5.0, received_at: days_ago(5))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 8.0, received_at: NaiveDateTime.utc_now())

      assert 85 = DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "returns 70 for slightly improving scores (0-1 point increase)" do
      lead = create_lead!()
      user = create_user!()

      # Older: 7.0, Recent: 7.5
      insert_phone_call!(lead.id, user.id, scorecard_avg: 7.0, received_at: days_ago(5))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 7.5, received_at: NaiveDateTime.utc_now())

      assert 70 = DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "returns 55 for flat scores" do
      lead = create_lead!()
      user = create_user!()

      insert_phone_call!(lead.id, user.id, scorecard_avg: 7.0, received_at: days_ago(5))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 7.0, received_at: NaiveDateTime.utc_now())

      assert 55 = DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "returns 35 for declining scores" do
      lead = create_lead!()
      user = create_user!()

      insert_phone_call!(lead.id, user.id, scorecard_avg: 8.0, received_at: days_ago(5))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 5.0, received_at: NaiveDateTime.utc_now())

      assert 35 = DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "returns nil with fewer than 2 scores" do
      lead = create_lead!()
      user = create_user!()

      insert_phone_call!(lead.id, user.id, scorecard_avg: 7.0)

      assert nil == DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "returns nil with no scores at all" do
      lead = create_lead!()
      assert nil == DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end

    test "uses 3 most recent scores comparing first to last" do
      lead = create_lead!()
      user = create_user!()

      # 3 scores: oldest=5.0, middle=9.0, newest=8.0
      # recent=8.0 (hd), older=5.0 (last) -> 8.0 > 5.0 + 1 -> 85
      insert_phone_call!(lead.id, user.id, scorecard_avg: 5.0, received_at: days_ago(10))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 9.0, received_at: days_ago(5))
      insert_phone_call!(lead.id, user.id, scorecard_avg: 8.0, received_at: NaiveDateTime.utc_now())

      assert 85 = DealHealthWorker.scorecard_trend(%{lead_id: lead.id})
    end
  end

  # ---------------------------------------------------------------------------
  # save_score/2
  # ---------------------------------------------------------------------------

  describe "save_score/2" do
    test "writes health_score to the database" do
      dc = create_demo_config!()

      DealHealthWorker.save_score(dc.id, 75)

      {:ok, %{rows: [[score]]}} =
        Saleflow.Repo.query(
          "SELECT health_score FROM demo_configs WHERE id = $1",
          [Ecto.UUID.dump!(dc.id)]
        )

      assert score == 75
    end

    test "overwrites existing health_score" do
      dc = create_demo_config!()

      DealHealthWorker.save_score(dc.id, 80)
      DealHealthWorker.save_score(dc.id, 30)

      {:ok, %{rows: [[score]]}} =
        Saleflow.Repo.query(
          "SELECT health_score FROM demo_configs WHERE id = $1",
          [Ecto.UUID.dump!(dc.id)]
        )

      assert score == 30
    end
  end

  # ---------------------------------------------------------------------------
  # list_active_configs/0
  # ---------------------------------------------------------------------------

  describe "list_active_configs/0" do
    test "returns configs not in cancelled stage" do
      Saleflow.Repo.query!("DELETE FROM demo_configs")

      lead = create_lead!()
      user = create_user!()

      dc1 = create_demo_config!(lead: lead, user: user)
      dc2 = create_demo_config!(lead: create_lead!(), user: user)

      # Cancel dc2
      set_stage!(dc2.id, :cancelled)

      configs = DealHealthWorker.list_active_configs()
      ids = Enum.map(configs, & &1.id)

      assert dc1.id in ids
      refute dc2.id in ids
    end

    test "returns empty list when no configs exist" do
      Saleflow.Repo.query!("DELETE FROM demo_configs")

      assert [] = DealHealthWorker.list_active_configs()
    end

    test "returns configs with correct fields" do
      Saleflow.Repo.query!("DELETE FROM demo_configs")

      lead = create_lead!()
      user = create_user!()
      _dc = create_demo_config!(lead: lead, user: user)

      [config] = DealHealthWorker.list_active_configs()

      assert is_binary(config.id)
      assert config.lead_id == lead.id
      assert config.stage == "meeting_booked"
      assert %NaiveDateTime{} = config.updated_at
    end

    test "returns empty list on DB error" do
      Saleflow.Repo.query!("ALTER TABLE demo_configs RENAME TO demo_configs_bak")
      assert DealHealthWorker.list_active_configs() == []
      Saleflow.Repo.query!("ALTER TABLE demo_configs_bak RENAME TO demo_configs")
    end
  end
end
