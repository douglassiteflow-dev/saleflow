defmodule SaleflowWeb.QuestionnairePublicControllerTest do
  use SaleflowWeb.ConnCase, async: true

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

  # ---------------------------------------------------------------------------
  # GET /q/:token
  # ---------------------------------------------------------------------------

  describe "GET /q/:token" do
    test "returns questionnaire data for valid token" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      resp = get(build_conn(), "/q/#{q.token}")
      body = json_response(resp, 200)

      assert body["questionnaire"]["id"] == q.id
      assert body["questionnaire"]["token"] == q.token
      assert body["questionnaire"]["status"] == "pending"
      assert body["questionnaire"]["customer_email"] == "kund@test.se"
    end

    test "returns 404 for invalid token" do
      resp = get(build_conn(), "/q/totally-invalid-token-does-not-exist")
      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /q/:token
  # ---------------------------------------------------------------------------

  describe "PATCH /q/:token" do
    test "saves capacity answer" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      resp = patch(build_conn(), "/q/#{q.token}", %{"capacity" => "10-50"})
      body = json_response(resp, 200)

      assert body["questionnaire"]["capacity"] == "10-50"
    end

    test "transitions from pending to in_progress on first save" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)
      assert q.status == :pending

      resp = patch(build_conn(), "/q/#{q.token}", %{"capacity" => "1-10"})
      body = json_response(resp, 200)

      assert body["questionnaire"]["status"] == "in_progress"
    end

    test "saves addon_services array" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      resp = patch(build_conn(), "/q/#{q.token}", %{"addon_services" => ["seo", "ads"]})
      body = json_response(resp, 200)

      assert body["questionnaire"]["addon_services"] == ["seo", "ads"]
    end

    test "returns 404 for invalid token" do
      resp = patch(build_conn(), "/q/nonexistent-token-xyz", %{"capacity" => "1-10"})
      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /q/:token/complete
  # ---------------------------------------------------------------------------

  describe "POST /q/:token/complete" do
    test "marks as completed with completed_at set" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      resp = post(build_conn(), "/q/#{q.token}/complete")
      body = json_response(resp, 200)

      assert body["questionnaire"]["status"] == "completed"
      assert body["questionnaire"]["completed_at"] != nil
    end

    test "returns 404 for invalid token" do
      resp = post(build_conn(), "/q/nonexistent-token-xyz/complete")
      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /q/:token/upload
  # ---------------------------------------------------------------------------

  describe "POST /q/:token/upload" do
    test "returns 400 when no file attached" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      resp = post(build_conn(), "/q/#{q.token}/upload")
      assert json_response(resp, 400)
    end

    test "rejects unsupported file type" do
      deal = create_deal_simple!()
      q = create_questionnaire!(deal)

      upload = %Plug.Upload{
        path: __ENV__.file,
        filename: "malware.exe",
        content_type: "application/x-executable"
      }

      resp = post(build_conn(), "/q/#{q.token}/upload", %{"file" => upload})
      body = json_response(resp, 415)
      assert body["error"] =~ "Filtypen"
    end
  end
end
