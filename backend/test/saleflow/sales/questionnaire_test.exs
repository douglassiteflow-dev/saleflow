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
end
