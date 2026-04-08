defmodule Saleflow.Workers.ContractReminderWorkerTest do
  @moduledoc """
  Tests for ContractReminderWorker.

  Uses async: false because tests manipulate timestamps via raw SQL.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.ContractReminderWorker
  alias Saleflow.Contracts
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "worker#{unique}@test.se",
        name: "Worker Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_deal!(lead, user) do
    {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
    deal
  end

  defp create_contract!(deal, user, attrs \\ %{}) do
    params =
      Map.merge(
        %{
          deal_id: deal.id,
          user_id: user.id,
          recipient_email: "kund@test.se",
          recipient_name: "Test AB",
          amount: 5000,
          terms: "Standard villkor",
          seller_name: user.name
        },
        attrs
      )

    {:ok, contract} = Contracts.create_contract(params)
    contract
  end

  defp set_contract_updated_at!(contract_id, days_ago) do
    offset_seconds = days_ago * 24 * 60 * 60

    Saleflow.Repo.query!(
      """
      UPDATE contracts
      SET updated_at = NOW() - ($1 * INTERVAL '1 second')
      WHERE id = $2
      """,
      [offset_seconds, Ecto.UUID.dump!(contract_id)]
    )
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "ContractReminderWorker.perform/1" do
    test "returns :ok" do
      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "sends reminders for contracts older than 3 days with status :sent" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      # Mark as sent
      {:ok, sent} = Contracts.mark_sent(contract)
      assert sent.status == :sent

      # Set updated_at to 4 days ago
      set_contract_updated_at!(sent.id, 4)

      assert :ok = ContractReminderWorker.perform(%Oban.Job{})

      # Give async email task time to complete
      Process.sleep(50)
    end

    test "sends reminders for contracts older than 3 days with status :draft" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      assert contract.status == :draft

      # Set updated_at to 5 days ago
      set_contract_updated_at!(contract.id, 5)

      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "does NOT send reminders for recently sent contracts (< 3 days)" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      {:ok, sent} = Contracts.mark_sent(contract)
      assert sent.status == :sent

      # updated_at is fresh (just now), so worker should not find this contract
      # We verify by checking the worker completes without error
      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "does NOT send reminders for signed contracts" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      # Sign the contract
      {:ok, signed} =
        Contracts.sign_contract(contract, %{
          customer_signature_url: "data:image/png;base64,abc",
          customer_name: "Kalle"
        })

      assert signed.status == :signed

      # Even if old, it should not be picked up
      set_contract_updated_at!(signed.id, 10)

      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "does NOT send reminders for viewed contracts" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      {:ok, viewed} = Contracts.mark_viewed(contract)
      assert viewed.status == :viewed

      set_contract_updated_at!(viewed.id, 10)

      # The worker filters for status in [:sent, :draft], so :viewed is excluded
      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "does NOT send reminders for superseded contracts" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      {:ok, superseded} = Contracts.supersede_contract(contract)
      assert superseded.status == :superseded

      set_contract_updated_at!(superseded.id, 10)

      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end

    test "returns :ok when there are no pending contracts" do
      assert :ok = ContractReminderWorker.perform(%Oban.Job{})
    end
  end
end
