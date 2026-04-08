defmodule Saleflow.Contracts.PdfGeneratorTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Contracts.PdfGenerator
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
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
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

  # ---------------------------------------------------------------------------
  # render_html/3
  # ---------------------------------------------------------------------------

  describe "render_html/3" do
    test "returns HTML string containing contract number" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)

      assert is_binary(html)
      assert html =~ contract.contract_number
    end

    test "HTML contains the amount" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user, %{amount: 12_500})

      html = PdfGenerator.render_html(contract, lead)

      # The format_currency function formats 12500 as "12 500 kr"
      assert html =~ "12 500 kr"
    end

    test "HTML contains the seller name" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)
      assert html =~ user.name
    end

    test "HTML contains the recipient/company name" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)
      assert html =~ lead.företag
    end

    test "HTML includes signature image when customer_signature_url is set" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      # Sign the contract first
      {:ok, signed} =
        Contracts.sign_contract(contract, %{
          customer_signature_url: "data:image/png;base64,SIGNATURE123",
          customer_name: "Kalle Anka"
        })

      html = PdfGenerator.render_html(signed, lead)
      assert html =~ "data:image/png;base64,SIGNATURE123"
      assert html =~ "Kalle Anka"
    end

    test "HTML does not include signature image when customer_signature_url is nil" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)
      # Should not have an img tag for customer signature
      refute html =~ "data:image/png;base64"
      # Should have placeholder for name
      assert html =~ "_______________________"
    end

    test "HTML uses custom template colors and font when template provided" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      {:ok, template} =
        Contracts.create_template(%{
          name: "Custom",
          primary_color: "#ff5500",
          font: "Roboto",
          header_html: "<div>Custom Header</div>",
          footer_html: "Custom Footer Text"
        })

      html = PdfGenerator.render_html(contract, lead, template)

      assert html =~ "#ff5500"
      assert html =~ "Roboto"
      assert html =~ "Custom Header"
      assert html =~ "Custom Footer Text"
    end

    test "HTML uses default styling when template is nil" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead, nil)

      assert html =~ "#0f172a"
      assert html =~ "Inter"
      assert html =~ "Siteflow"
    end

    test "HTML contains standard terms text" do
      lead = create_lead!()
      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)

      # Default terms contain specific Swedish legal text
      assert html =~ "TJÄNSTENS OMFATTNING"
      assert html =~ "BETALNINGSVILLKOR"
      assert html =~ "GDPR"
    end

    test "HTML includes lead orgnr when present" do
      unique = System.unique_integer([:positive])

      {:ok, lead} =
        Sales.create_lead(%{
          företag: "Test AB #{unique}",
          telefon: "+46701234567",
          orgnr: "556677-8899"
        })

      user = create_user!()
      deal = create_deal!(lead, user)
      contract = create_contract!(deal, user)

      html = PdfGenerator.render_html(contract, lead)
      assert html =~ "556677-8899"
    end
  end

  # ---------------------------------------------------------------------------
  # format_currency/2
  # ---------------------------------------------------------------------------

  describe "format_currency/2" do
    test "formats integer amount with SEK" do
      assert PdfGenerator.format_currency(5000) == "5 000 kr"
    end

    test "formats large amount" do
      assert PdfGenerator.format_currency(1_250_000) == "1 250 000 kr"
    end

    test "formats small amount" do
      assert PdfGenerator.format_currency(99) == "99 kr"
    end

    test "formats with custom currency" do
      assert PdfGenerator.format_currency(5000, "EUR") == "5 000 EUR"
    end

    test "returns 0 kr for non-integer" do
      assert PdfGenerator.format_currency(nil) == "0 kr"
    end
  end
end
