defmodule Saleflow.Factory do
  alias Saleflow.Sales
  alias Saleflow.Accounts

  def create_lead!(attrs \\ %{}) do
    unique = System.unique_integer([:positive])
    defaults = %{företag: "Test AB #{unique}", telefon: "+46701234567"}
    {:ok, lead} = Sales.create_lead(Map.merge(defaults, attrs))
    lead
  end

  def create_user!(attrs \\ %{}) do
    unique = System.unique_integer([:positive])

    defaults = %{
      email: "agent#{unique}@test.se",
      name: "Agent #{unique}",
      password: "Password123!",
      password_confirmation: "Password123!"
    }

    {:ok, user} =
      Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, Map.merge(defaults, attrs))
      |> Ash.create()

    user
  end

  def create_deal!(lead, user) do
    {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
    deal
  end

  def create_contract!(deal, user, attrs \\ %{}) do
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

    {:ok, contract} = Saleflow.Contracts.create_contract(params)
    contract
  end

  def create_questionnaire!(deal, attrs \\ %{}) do
    token = Base.url_encode64(:crypto.strong_rand_bytes(32), padding: false)

    params =
      Map.merge(
        %{
          deal_id: deal.id,
          customer_email: "kund@test.se",
          token: token
        },
        attrs
      )

    {:ok, q} = Sales.create_questionnaire(params)
    q
  end

  def advance_deal_to!(deal, target_stage) do
    if deal.stage == target_stage do
      deal
    else
      {:ok, advanced} = Sales.advance_deal(deal)
      advance_deal_to!(advanced, target_stage)
    end
  end
end
