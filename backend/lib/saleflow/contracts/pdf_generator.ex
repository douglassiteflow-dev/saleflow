defmodule Saleflow.Contracts.PdfGenerator do
  @moduledoc """
  Generates professional PDF contracts from HTML templates.
  Uses ChromicPDF with headless Chrome.
  Supports optional ContractTemplate for branding customization.
  """

  @default_terms """
  1. TJÄNSTENS OMFATTNING
  Siteflow tillhandahåller en webbtjänst enligt överenskomna villkor. Tjänsten inkluderar hosting, SSL-certifikat, domänhantering och teknisk support under avtalstiden.

  2. BETALNINGSVILLKOR
  Fakturering sker enligt avtalat belopp. Faktura skickas elektroniskt via e-post. Betalningsvillkor: 30 dagar netto. Vid utebliven betalning debiteras dröjsmålsränta enligt räntelagen.

  3. AVTALSTID OCH UPPSÄGNING
  Avtalet gäller tills vidare om inte annat anges. Uppsägningstiden är 3 månader och ska ske skriftligen. Vid bindningstid kan avtalet inte sägas upp före bindningstidens utgång.

  4. ÄNDRINGAR
  Siteflow förbehåller sig rätten att göra mindre ändringar i tjänsten som inte väsentligt påverkar dess funktion. Väsentliga ändringar meddelas minst 30 dagar i förväg.

  5. ANSVARSBEGRÄNSNING
  Siteflows ansvar är begränsat till direkta skador och uppgår maximalt till det belopp kunden betalat under de senaste 12 månaderna. Siteflow ansvarar inte för indirekta skador, utebliven vinst eller dataförlust.

  6. PERSONUPPGIFTER (GDPR)
  Siteflow behandlar personuppgifter i enlighet med EU:s dataskyddsförordning (GDPR). Personuppgifter som samlas in via webbplatsen hanteras enligt Siteflows integritetspolicy.

  7. FORCE MAJEURE
  Part är befriad från påföljd för underlåtenhet att fullgöra viss förpliktelse om underlåtenheten beror på omständigheter utanför partens kontroll.

  8. TVIST
  Tvist med anledning av detta avtal ska i första hand lösas genom förhandling. Om parterna inte kan enas ska tvisten avgöras av svensk domstol med tillämpning av svensk lag.
  """

  @doc "Generates a PDF binary for a contract."
  def generate(contract, lead, template \\ nil) do
    html = render_html(contract, lead, template)
    print_html_to_pdf(html)
  end

  @doc "Generates a signed PDF binary for a contract (includes customer signature)."
  def generate_signed(contract, lead, template \\ nil) do
    html = render_html(contract, lead, template)
    print_html_to_pdf(html)
  end

  defp print_html_to_pdf(html) do
    ChromicPDF.print_to_pdf({:html, html},
      print_to_pdf: %{
        preferCSSPageSize: true,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0
      }
    )
  end

  @doc "Renders the contract as a 5-page HTML document."
  def render_html(contract, lead, template \\ nil) do
    primary_color = (template && template.primary_color) || "#0f172a"
    font_family = (template && template.font) || "Inter"
    custom_logo_url = template && template.logo_url
    custom_header = (template && template.header_html) || ""
    custom_footer = (template && template.footer_html) || ""

    custom_terms =
      if template && template.terms_html && template.terms_html != "",
        do: template.terms_html,
        else: @default_terms

    company_name = lead.företag || "Kund"
    seller_name = contract.seller_name || "Siteflow"
    date = Calendar.strftime(DateTime.utc_now(), "%Y-%m-%d")
    formatted_amount = format_currency(contract.amount, contract.currency)

    cover_logo =
      cond do
        custom_logo_url && custom_logo_url != "" ->
          ~s(<img src="#{custom_logo_url}" class="cover-logo" />)

        true ->
          ~s(<div style="width:60px;height:60px;background:#{primary_color};color:white;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;margin-bottom:40px;">SF</div>)
      end

    page_footer_text =
      if custom_footer != "",
        do: custom_footer,
        else: "Siteflow &middot; info@siteflow.se"

    """
    <!DOCTYPE html>
    <html lang="sv">
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=#{String.replace(font_family, " ", "+") }:wght@300;400;500;600;700&family=Dancing+Script:wght@700&display=swap');

        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: '#{font_family}', sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.6; }

        .page { width: 210mm; height: 297mm; padding: 25mm 30mm; page-break-after: always; position: relative; overflow: hidden; }
        .page:last-child { page-break-after: avoid; }

        /* Cover */
        .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
        .cover-logo { width: 60px; height: 60px; border-radius: 12px; object-fit: contain; margin-bottom: 40px; }
        .cover h1 { font-size: 32pt; font-weight: 700; color: #{primary_color}; margin-bottom: 8px; }
        .cover h2 { font-size: 16pt; font-weight: 400; color: #64748b; margin-bottom: 60px; }
        .cover-org { font-size: 14pt; font-weight: 600; color: #{primary_color}; margin-bottom: 8px; }
        .cover-meta { font-size: 10pt; color: #94a3b8; }
        .cover-line { width: 80px; height: 3px; background: #{primary_color}; margin: 40px auto; }

        /* Custom header */
        .custom-header { margin-bottom: 16px; }

        /* Section headers */
        .section-title { font-size: 18pt; font-weight: 700; color: #{primary_color}; margin-bottom: 24px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
        .subsection { margin-bottom: 24px; }
        .subsection h3 { font-size: 12pt; font-weight: 600; color: #334155; margin-bottom: 8px; }
        .subsection p { color: #475569; }

        /* Info table */
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-item { padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .info-label { font-size: 9pt; font-weight: 500; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .info-value { font-size: 14pt; font-weight: 600; color: #{primary_color}; }
        .info-value.highlight { color: #{primary_color}; font-size: 18pt; }

        /* Terms */
        .terms { font-size: 9pt; color: #64748b; line-height: 1.8; white-space: pre-wrap; }

        /* Signature */
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
        .sig-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; min-height: 160px; }
        .sig-box h4 { font-size: 10pt; font-weight: 600; color: #64748b; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .sig-line { border-bottom: 1px solid #cbd5e1; margin-bottom: 8px; padding-bottom: 40px; }
        .sig-name { font-size: 10pt; color: #334155; }
        .sig-date { font-size: 9pt; color: #94a3b8; }
        .sig-seller { font-family: 'Dancing Script', cursive; font-size: 28px; color: #{primary_color}; }

        /* Footer */
        .page-footer { position: absolute; bottom: 15mm; left: 30mm; right: 30mm; text-align: center; font-size: 8pt; color: #cbd5e1; }
      </style>
    </head>
    <body>

      <!-- PAGE 1: FÖRSÄTTSBLAD -->
      <div class="page cover">
        #{cover_logo}
        #{if custom_header != "", do: "<div class=\"custom-header\">#{custom_header}</div>", else: ""}
        <h1>Avtal</h1>
        <h2>#{company_name}</h2>
        <div class="cover-line"></div>
        <div class="cover-org">#{company_name}</div>
        <div class="cover-meta">Avtalsnummer: #{contract.contract_number}</div>
        <div class="cover-meta">Datum: #{date}</div>
        <div class="page-footer">#{page_footer_text}</div>
      </div>

      <!-- PAGE 2: BESKRIVNING -->
      <div class="page">
        <div class="section-title">Beskrivning</div>

        <div class="subsection">
          <h3>Kund</h3>
          <p><strong>Företag:</strong> #{company_name}</p>
          #{if lead.orgnr, do: "<p><strong>Org.nr:</strong> #{lead.orgnr}</p>", else: ""}
          #{if lead.epost, do: "<p><strong>E-post:</strong> #{lead.epost}</p>", else: ""}
          #{if lead.telefon, do: "<p><strong>Telefon:</strong> #{lead.telefon}</p>", else: ""}
        </div>

        <div class="subsection">
          <h3>Tjänstebeskrivning</h3>
          <p>#{contract.terms || "Enligt överenskomna villkor."}</p>
        </div>

        <div class="page-footer">#{contract.contract_number} &middot; Sida 2 av 5</div>
      </div>

      <!-- PAGE 3: PRISÖVERSIKT -->
      <div class="page">
        <div class="section-title">Prisöversikt</div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Kund</div>
            <div class="info-value">#{company_name}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Valuta</div>
            <div class="info-value">#{contract.currency}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item" style="grid-column: span 2;">
            <div class="info-label">Belopp</div>
            <div class="info-value highlight">#{formatted_amount}</div>
          </div>
        </div>

        <div class="subsection" style="margin-top: 32px;">
          <h3>Betalningsvillkor</h3>
          <p>Betalning sker enligt överenskommelse. Faktura skickas elektroniskt via e-post. Betalningsvillkor: 30 dagar netto.</p>
        </div>

        <div class="page-footer">#{contract.contract_number} &middot; Sida 3 av 5</div>
      </div>

      <!-- PAGE 4: ALLMÄNNA VILLKOR -->
      <div class="page">
        <div class="section-title">Allmänna villkor</div>
        <div class="terms">#{custom_terms}</div>
        <div class="page-footer">#{contract.contract_number} &middot; Sida 4 av 5</div>
      </div>

      <!-- PAGE 5: SIGNERING -->
      <div class="page">
        <div class="section-title">Signering</div>

        <p style="color: #64748b; margin-bottom: 32px;">
          Genom att signera detta avtal godkänner parterna ovanstående villkor och förbinder sig att följa avtalet under den överenskomna avtalstiden.
        </p>

        <div class="sig-grid">
          <div class="sig-box">
            <h4>Siteflow</h4>
            <div class="sig-line">
              <span class="sig-seller">#{seller_name}</span>
            </div>
            <div class="sig-name">#{seller_name}</div>
            <div class="sig-date">Datum: #{date}</div>
          </div>

          <div class="sig-box">
            <h4>Kund — #{company_name}</h4>
            <div class="sig-line" style="padding-bottom: 40px;">
              #{customer_signature_html(contract)}
            </div>
            <div class="sig-name">#{customer_name_line(contract)}</div>
            <div class="sig-date">#{customer_date_line(contract)}</div>
          </div>
        </div>

        <div class="page-footer">#{contract.contract_number} &middot; Sida 5 av 5</div>
      </div>

    </body>
    </html>
    """
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp customer_signature_html(contract) do
    if contract.customer_signature_url do
      ~s(<img src="#{contract.customer_signature_url}" style="max-height: 50px; max-width: 200px;" />)
    else
      ""
    end
  end

  defp customer_name_line(contract) do
    if contract.customer_name do
      "Namnförtydligande: #{contract.customer_name}"
    else
      "Namnförtydligande: _______________________"
    end
  end

  defp customer_date_line(contract) do
    if contract.customer_signed_at do
      "Datum: #{Calendar.strftime(contract.customer_signed_at, "%Y-%m-%d")}"
    else
      "Datum: _______________________"
    end
  end

  @doc "Formats an integer amount with Swedish formatting (space-separated thousands + currency suffix)."
  def format_currency(amount, currency \\ "SEK")

  def format_currency(amount, currency) when is_integer(amount) do
    suffix = if currency == "SEK", do: " kr", else: " #{currency}"

    amount
    |> Integer.to_string()
    |> String.reverse()
    |> String.replace(~r/(\d{3})(?=\d)/, "\\1 ")
    |> String.reverse()
    |> Kernel.<>(suffix)
  end

  def format_currency(_, _), do: "0 kr"
end
