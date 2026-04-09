defmodule Saleflow.Sales.QuestionnaireTest do
  use Saleflow.DataCase, async: true

  import Saleflow.Factory

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_deal_simple! do
    lead = create_lead!()
    user = create_user!()
    create_deal!(lead, user)
  end

  defp unique_token do
    Base.url_encode64(:crypto.strong_rand_bytes(32), padding: false)
  end

  # ---------------------------------------------------------------------------
  # create_questionnaire/1
  # ---------------------------------------------------------------------------

  describe "create_questionnaire/1" do
    test "creates with valid params and default status is :pending" do
      deal = create_deal_simple!()
      token = unique_token()

      assert {:ok, q} =
               Sales.create_questionnaire(%{
                 deal_id: deal.id,
                 customer_email: "kund@test.se",
                 token: token
               })

      assert q.deal_id == deal.id
      assert q.customer_email == "kund@test.se"
      assert q.token == token
      assert q.status == :pending
    end

    test "rejects without customer_email" do
      deal = create_deal_simple!()

      assert {:error, _} =
               Sales.create_questionnaire(%{
                 deal_id: deal.id,
                 token: unique_token()
               })
    end

    test "rejects without token" do
      deal = create_deal_simple!()

      assert {:error, _} =
               Sales.create_questionnaire(%{
                 deal_id: deal.id,
                 customer_email: "kund@test.se"
               })
    end
  end

  # ---------------------------------------------------------------------------
  # save_questionnaire_answers/2
  # ---------------------------------------------------------------------------

  describe "save_questionnaire_answers/2" do
    test "updates capacity and transitions status to :in_progress" do
      deal = create_deal_simple!()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: unique_token()})
      assert q.status == :pending

      assert {:ok, updated} = Sales.save_questionnaire_answers(q, %{capacity: "10-50"})
      assert updated.capacity == "10-50"
      assert updated.status == :in_progress
    end

    test "updates addon_services array" do
      deal = create_deal_simple!()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: unique_token()})

      assert {:ok, updated} = Sales.save_questionnaire_answers(q, %{addon_services: ["seo", "ads"]})
      assert updated.addon_services == ["seo", "ads"]
    end

    test "stays :in_progress if already :in_progress" do
      deal = create_deal_simple!()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: unique_token()})

      {:ok, q_in_progress} = Sales.save_questionnaire_answers(q, %{capacity: "first"})
      assert q_in_progress.status == :in_progress

      {:ok, q_still} = Sales.save_questionnaire_answers(q_in_progress, %{capacity: "second"})
      assert q_still.status == :in_progress
      assert q_still.capacity == "second"
    end
  end

  # ---------------------------------------------------------------------------
  # complete_questionnaire/1
  # ---------------------------------------------------------------------------

  describe "complete_questionnaire/1" do
    test "sets status to :completed and completed_at" do
      deal = create_deal_simple!()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: unique_token()})

      assert {:ok, completed} = Sales.complete_questionnaire(q)
      assert completed.status == :completed
      assert completed.completed_at != nil
    end
  end

  # ---------------------------------------------------------------------------
  # get_questionnaire_by_token/1
  # ---------------------------------------------------------------------------

  describe "get_questionnaire_by_token/1" do
    test "finds by token" do
      deal = create_deal_simple!()
      token = unique_token()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: token})

      assert {:ok, found} = Sales.get_questionnaire_by_token(token)
      assert found.id == q.id
    end

    test "returns error for non-existent token" do
      assert {:error, :not_found} = Sales.get_questionnaire_by_token("nonexistent-token-xyz")
    end
  end

  # ---------------------------------------------------------------------------
  # get_questionnaire_for_deal/1
  # ---------------------------------------------------------------------------

  describe "get_questionnaire_for_deal/1" do
    test "returns questionnaire for deal" do
      deal = create_deal_simple!()
      {:ok, q} = Sales.create_questionnaire(%{deal_id: deal.id, customer_email: "k@t.se", token: unique_token()})

      assert {:ok, found} = Sales.get_questionnaire_for_deal(deal.id)
      assert found.id == q.id
    end

    test "returns nil when none exists" do
      deal = create_deal_simple!()

      assert {:ok, nil} = Sales.get_questionnaire_for_deal(deal.id)
    end
  end

  # ---------------------------------------------------------------------------
  # create_questionnaire_for_lead/1
  # ---------------------------------------------------------------------------

  describe "create_questionnaire_for_lead/1" do
    test "creates questionnaire tied to a lead (no deal)" do
      lead = create_lead!()
      token = unique_token()

      assert {:ok, q} =
               Sales.create_questionnaire_for_lead(%{
                 lead_id: lead.id,
                 customer_email: "kund@test.se",
                 token: token
               })

      assert q.lead_id == lead.id
      assert q.deal_id == nil
      assert q.customer_email == "kund@test.se"
      assert q.token == token
      assert q.status == :pending
      assert q.opened_at == nil
      assert q.started_at == nil
    end

    test "rejects without customer_email" do
      lead = create_lead!()

      assert {:error, _} =
               Sales.create_questionnaire_for_lead(%{
                 lead_id: lead.id,
                 token: unique_token()
               })
    end
  end

  # ---------------------------------------------------------------------------
  # mark_questionnaire_opened/1
  # ---------------------------------------------------------------------------

  describe "mark_questionnaire_opened/1" do
    test "sets opened_at on first call" do
      q = create_lead_questionnaire!()
      assert q.opened_at == nil

      assert {:ok, opened} = Sales.mark_questionnaire_opened(q)
      assert opened.opened_at != nil
    end

    test "does not change opened_at on subsequent calls" do
      q = create_lead_questionnaire!()
      {:ok, first} = Sales.mark_questionnaire_opened(q)
      first_opened = first.opened_at

      {:ok, second} = Sales.mark_questionnaire_opened(first)
      assert second.opened_at == first_opened
    end
  end

  # ---------------------------------------------------------------------------
  # save_answers — started_at tracking
  # ---------------------------------------------------------------------------

  describe "save_answers started_at tracking" do
    test "sets started_at on first save" do
      q = create_lead_questionnaire!()
      assert q.started_at == nil

      assert {:ok, saved} = Sales.save_questionnaire_answers(q, %{capacity: "50"})
      assert saved.started_at != nil
      assert saved.status == :in_progress
    end

    test "does not change started_at on subsequent saves" do
      q = create_lead_questionnaire!()
      {:ok, first} = Sales.save_questionnaire_answers(q, %{capacity: "first"})
      first_started = first.started_at

      {:ok, second} = Sales.save_questionnaire_answers(first, %{capacity: "second"})
      assert second.started_at == first_started
    end
  end

  # ---------------------------------------------------------------------------
  # latest_questionnaire_for_lead/1
  # ---------------------------------------------------------------------------

  describe "latest_questionnaire_for_lead/1" do
    test "returns most recent questionnaire for lead" do
      lead = create_lead!()
      {:ok, _older} = Sales.create_questionnaire_for_lead(%{lead_id: lead.id, customer_email: "k@t.se", token: unique_token()})
      # Sekund-precision på inserted_at → sleep >1s för deterministisk ordning
      Process.sleep(1100)
      {:ok, newer} = Sales.create_questionnaire_for_lead(%{lead_id: lead.id, customer_email: "k@t.se", token: unique_token()})

      result = Sales.latest_questionnaire_for_lead(lead.id)
      assert result.id == newer.id
    end

    test "returns nil when no questionnaires exist for lead" do
      lead = create_lead!()
      assert Sales.latest_questionnaire_for_lead(lead.id) == nil
    end
  end

  defp create_lead_questionnaire! do
    lead = create_lead!()
    {:ok, q} =
      Sales.create_questionnaire_for_lead(%{
        lead_id: lead.id,
        customer_email: "c@e.se",
        token: unique_token()
      })
    q
  end
end
