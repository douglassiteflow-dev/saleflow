defmodule SaleflowWeb.ContractPublicControllerTest do
  use SaleflowWeb.ConnCase, async: true

  import Saleflow.Factory

  alias Saleflow.Contracts
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_deal_with_context! do
    lead = create_lead!()
    user = create_user!()
    deal = create_deal!(lead, user)
    {deal, lead, user}
  end

  # ---------------------------------------------------------------------------
  # GET /api/contracts/:token (show)
  # ---------------------------------------------------------------------------

  describe "GET /api/contracts/:token" do
    test "returns contract data for valid token" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      resp = get(build_conn(), "/api/contracts/#{contract.access_token}")
      body = json_response(resp, 200)

      assert body["id"] == contract.id
      assert body["contract_number"] == contract.contract_number
      assert body["status"] == "draft"
      assert body["amount"] == 5000
      assert body["currency"] == "SEK"
      assert body["seller_name"] == user.name
      assert body["recipient_name"] == "Test AB"
      assert body["recipient_email"] == "kund@test.se"
    end

    test "returns 404 for invalid token" do
      resp = get(build_conn(), "/api/contracts/totally-invalid-token-xyz")
      assert json_response(resp, 404)
      assert json_response(resp, 404)["error"] =~ "hittades inte"
    end

    test "returns 410 for expired contract" do
      {deal, _lead, user} = create_deal_with_context!()
      # Create contract with an expires_at in the past
      yesterday = DateTime.utc_now() |> DateTime.add(-86_400, :second)

      contract = create_contract!(deal, user, %{expires_at: yesterday})

      resp = get(build_conn(), "/api/contracts/#{contract.access_token}")
      assert json_response(resp, 410)
      assert json_response(resp, 410)["error"] =~ "gatt ut"
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/contracts/:token/verify
  # ---------------------------------------------------------------------------

  describe "POST /api/contracts/:token/verify" do
    test "correct code returns full data and marks as viewed" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      resp =
        build_conn()
        |> post("/api/contracts/#{contract.access_token}/verify", %{
          "code" => contract.verification_code
        })

      body = json_response(resp, 200)

      assert body["id"] == contract.id
      assert body["status"] == "viewed"
      assert body["contract_number"] == contract.contract_number
      assert body["amount"] == 5000
      assert body["access_token"] == contract.access_token
    end

    test "wrong code returns 401" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      resp =
        build_conn()
        |> post("/api/contracts/#{contract.access_token}/verify", %{
          "code" => "000000"
        })

      assert json_response(resp, 401)
      assert json_response(resp, 401)["error"] =~ "Felaktig"
    end

    test "invalid token returns 404" do
      resp =
        build_conn()
        |> post("/api/contracts/invalid-token/verify", %{
          "code" => "123456"
        })

      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/contracts/:token/sign
  # ---------------------------------------------------------------------------

  describe "POST /api/contracts/:token/sign" do
    test "valid signature signs the contract" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      resp =
        build_conn()
        |> post("/api/contracts/#{contract.access_token}/sign", %{
          "signature" => "data:image/png;base64,abc123",
          "customer_name" => "Kalle Anka"
        })

      body = json_response(resp, 200)

      assert body["signed"] == true
      assert body["signed_at"] != nil
    end

    test "already signed contract returns 400" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      # Sign it first
      {:ok, _signed} =
        Contracts.sign_contract(contract, %{
          customer_signature_url: "data:image/png;base64,abc123",
          customer_name: "Kalle Anka"
        })

      # Try to sign again via the public endpoint
      # Need to re-fetch the contract to get the updated status
      {:ok, signed_contract} = Contracts.get_contract_by_token(contract.access_token)
      assert signed_contract.status == :signed

      resp =
        build_conn()
        |> post("/api/contracts/#{contract.access_token}/sign", %{
          "signature" => "data:image/png;base64,def456",
          "customer_name" => "Someone Else"
        })

      assert json_response(resp, 400)
      assert json_response(resp, 400)["error"] =~ "redan signerat"
    end

    test "signing advances linked Deal to next stage" do
      {deal, _lead, user} = create_deal_with_context!()

      # Advance deal to contract_sent so signing advances to :won
      deal = advance_deal_to!(deal, :contract_sent)
      contract = create_contract!(deal, user)

      _resp =
        build_conn()
        |> post("/api/contracts/#{contract.access_token}/sign", %{
          "signature" => "data:image/png;base64,abc123",
          "customer_name" => "Kalle Anka"
        })

      {:ok, refreshed_deal} = Sales.get_deal(deal.id)
      assert refreshed_deal.stage == :won
    end

    test "invalid token returns 404" do
      resp =
        build_conn()
        |> post("/api/contracts/invalid-token/sign", %{
          "signature" => "data:image/png;base64,abc123",
          "customer_name" => "Test"
        })

      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/contracts/:token (track)
  # ---------------------------------------------------------------------------

  describe "PATCH /api/contracts/:token" do
    test "saves tracking data" do
      {deal, _lead, user} = create_deal_with_context!()
      contract = create_contract!(deal, user)

      resp =
        build_conn()
        |> patch("/api/contracts/#{contract.access_token}", %{
          "last_viewed_page" => "page_2",
          "total_view_time" => 45,
          "page_views" => %{"page_1" => 3, "page_2" => 1}
        })

      body = json_response(resp, 200)
      assert body["ok"] == true

      # Verify data was persisted
      {:ok, updated} = Contracts.get_contract_by_token(contract.access_token)
      assert updated.last_viewed_page == "page_2"
      assert updated.total_view_time == 45
      assert updated.page_views == %{"page_1" => 3, "page_2" => 1}
    end

    test "invalid token returns 404" do
      resp =
        build_conn()
        |> patch("/api/contracts/invalid-token", %{
          "last_viewed_page" => "page_1",
          "total_view_time" => 10
        })

      assert json_response(resp, 404)
    end
  end
end
