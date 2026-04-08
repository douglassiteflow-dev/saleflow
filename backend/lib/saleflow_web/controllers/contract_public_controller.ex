defmodule SaleflowWeb.ContractPublicController do
  use SaleflowWeb, :controller

  alias Saleflow.Contracts

  @doc "GET /api/contracts/:token — fetch contract info"
  def show(conn, %{"token" => token}) do
    case Contracts.get_contract_by_token(token) do
      {:ok, nil} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})

      {:ok, contract} ->
        if contract.expires_at && DateTime.compare(DateTime.utc_now(), contract.expires_at) == :gt do
          conn |> put_status(410) |> json(%{error: "Avtalet har gatt ut"})
        else
          conn |> json(%{
            id: contract.id,
            contractNumber: contract.contract_number,
            status: contract.status,
            amount: contract.amount,
            currency: contract.currency,
            terms: contract.terms,
            sellerName: contract.seller_name,
            sellerSignedAt: contract.seller_signed_at,
            recipientName: contract.recipient_name,
            recipientEmail: contract.recipient_email,
            expiresAt: contract.expires_at,
            customerSignedAt: contract.customer_signed_at
          })
        end

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})
    end
  end

  @doc "POST /api/contracts/:token/verify — verify code and unlock full contract"
  def verify(conn, %{"token" => token, "code" => code}) do
    case Contracts.get_contract_by_token(token) do
      {:ok, nil} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})

      {:ok, contract} ->
        if contract.verification_code == code do
          {:ok, updated} = Contracts.mark_viewed(contract)

          conn |> json(%{
            id: updated.id,
            contractNumber: updated.contract_number,
            status: updated.status,
            amount: updated.amount,
            currency: updated.currency,
            terms: updated.terms,
            sellerName: updated.seller_name,
            sellerSignedAt: updated.seller_signed_at,
            recipientName: updated.recipient_name,
            recipientEmail: updated.recipient_email,
            customerName: updated.customer_name,
            customerSignedAt: updated.customer_signed_at,
            signedPdfUrl: updated.signed_pdf_url,
            accessToken: updated.access_token,
            expiresAt: updated.expires_at
          })
        else
          conn |> put_status(401) |> json(%{error: "Felaktig kod"})
        end

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})
    end
  end

  @doc "POST /api/contracts/:token/sign — customer signs contract"
  def sign(conn, %{"token" => token} = params) do
    case Contracts.get_contract_by_token(token) do
      {:ok, nil} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})

      {:ok, contract} ->
        if contract.status == :signed do
          conn |> put_status(400) |> json(%{error: "Avtalet ar redan signerat"})
        else
          case Contracts.sign_contract(contract, %{
                 customer_signature_url: params["signature"],
                 customer_name: params["customer_name"] || params["name"],
                 customer_email: params["customer_email"] || params["email"]
               }) do
            {:ok, updated} ->
              Phoenix.PubSub.broadcast(
                Saleflow.PubSub,
                "contract:#{token}",
                %{
                  event: "status_change",
                  payload: %{
                    status: "signed",
                    customerName: updated.customer_name,
                    customerSignedAt: updated.customer_signed_at && DateTime.to_iso8601(updated.customer_signed_at),
                    signedPdfUrl: updated.signed_pdf_url
                  }
                }
              )

              conn |> json(%{
                signed: true,
                signedAt: updated.customer_signed_at,
                signedPdfUrl: updated.signed_pdf_url
              })

            {:error, _} ->
              conn |> put_status(422) |> json(%{error: "Kunde inte signera avtalet"})
          end
        end

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})
    end
  end

  @doc "GET /api/contracts/:token/pdf — download contract PDF"
  def pdf(conn, %{"token" => _token}) do
    conn |> put_status(501) |> json(%{error: "PDF generation coming soon"})
  end

  @doc "PATCH /api/contracts/:token — update tracking data"
  def track(conn, %{"token" => token} = params) do
    case Contracts.get_contract_by_token(token) do
      {:ok, nil} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})

      {:ok, contract} ->
        Contracts.update_tracking(contract, %{
          last_viewed_page: params["last_viewed_page"],
          total_view_time: params["total_view_time"],
          page_views: params["page_views"]
        })

        conn |> json(%{ok: true})

      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Avtal hittades inte"})
    end
  end
end
