defmodule SaleflowWeb.DemoLookupControllerTest do
  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Sales

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp setup_demo_ready!(slug) do
    user = create_user!()
    lead = create_lead!()
    {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
    {:ok, dc} = Sales.start_generation(dc)
    {:ok, dc} = Sales.generation_complete(dc, %{
      website_path: "https://raw-vercel-#{slug}.vercel.app",
      preview_url: "https://demo.siteflow.se/#{slug}"
    })
    dc
  end

  describe "GET /api/d/:slug" do
    test "returns website_path (raw URL) for a demo_ready config matching slug", %{conn: conn} do
      slug = "test-lookup-#{System.unique_integer([:positive])}"
      _dc = setup_demo_ready!(slug)

      resp = get(conn, "/api/d/#{slug}")
      assert %{"slug" => ^slug, "url" => url} = json_response(resp, 200)
      assert url == "https://raw-vercel-#{slug}.vercel.app"
      refute url =~ "demo.siteflow.se"
    end

    test "returns website_path for demo_held stage", %{conn: conn} do
      slug = "held-lookup-#{System.unique_integer([:positive])}"
      dc = setup_demo_ready!(slug)
      {:ok, _} = Sales.advance_to_demo_held(dc)

      resp = get(conn, "/api/d/#{slug}")
      assert %{"url" => url} = json_response(resp, 200)
      assert url =~ "raw-vercel"
    end

    test "returns website_path for followup stage", %{conn: conn} do
      slug = "followup-lookup-#{System.unique_integer([:positive])}"
      dc = setup_demo_ready!(slug)
      {:ok, dc} = Sales.advance_to_demo_held(dc)
      {:ok, _} = Sales.advance_to_followup(dc)

      resp = get(conn, "/api/d/#{slug}")
      assert %{"url" => url} = json_response(resp, 200)
      assert url =~ "raw-vercel"
    end

    test "returns 404 for unknown slug", %{conn: conn} do
      resp = get(conn, "/api/d/non-existent-slug-xyz-#{System.unique_integer([:positive])}")
      assert json_response(resp, 404)
    end

    test "skips demo_ready matches when website_path is nil but preview_url matches", %{conn: conn} do
      slug = "preview-only-#{System.unique_integer([:positive])}"
      user = create_user!()
      lead = create_lead!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)
      # No website_path, only preview_url
      {:ok, _} = Sales.generation_complete(dc, %{
        website_path: nil,
        preview_url: "https://demo.siteflow.se/#{slug}"
      })

      resp = get(conn, "/api/d/#{slug}")
      # Falls back to preview_url (which is the demo.siteflow.se URL itself → not ideal for proxy
      # but it's the only thing we have)
      assert %{"url" => url} = json_response(resp, 200)
      assert url =~ slug
    end
  end
end
