defmodule SaleflowWeb.DealController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit

  import SaleflowWeb.ControllerHelpers
  import SaleflowWeb.Serializers

  alias Saleflow.Notifications.EmailTemplate

  @doc """
  List deals.
  Agents see only their own deals; admins see all.
  Returns deals enriched with lead_name and user_name.
  """
  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, deals} =
      case user.role do
        :admin -> Sales.list_deals()
        _ -> Sales.list_deals_for_user(user.id)
      end

    enriched = enrich_deals(deals)
    json(conn, %{deals: enriched})
  end

  @doc """
  Show a single deal with lead, meetings (filtered by deal_id), and audit logs.
  Agents can only see their own deals.
  """
  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id),
         {:ok, meetings} <- Sales.list_meetings_for_deal(deal.id),
         {:ok, audit_logs} <- Audit.list_for_resource("Deal", deal.id) do
      user_names = build_global_user_name_map()

      json(conn, %{
        deal: serialize_deal(deal, lead, user_names),
        lead: serialize_lead(lead),
        meetings: Enum.map(meetings, &serialize_meeting(&1, user_names)),
        audit_logs: Enum.map(audit_logs, &serialize_audit_log(&1, user_names))
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})
    end
  end

  @doc """
  Advance deal to the next pipeline stage.
  Authorization: admin or deal owner.
  """
  def advance(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, advanced} <- Sales.advance_deal(deal) do
      broadcast_dashboard_update("deal_advanced")
      json(conn, %{deal: serialize_deal_simple(advanced)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to advance deal"})
    end
  end

  @doc """
  Update deal fields: notes, website_url, meeting_outcome, needs_followup, domain, domain_sponsored.
  Authorization: admin or deal owner.
  """
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user) do
      update_params =
        %{}
        |> maybe_put(:notes, params["notes"])
        |> maybe_put(:website_url, params["website_url"])
        |> maybe_put(:meeting_outcome, params["meeting_outcome"])
        |> maybe_put(:needs_followup, params["needs_followup"])
        |> maybe_put(:domain, params["domain"])
        |> maybe_put(:domain_sponsored, params["domain_sponsored"])

      case Sales.update_deal(deal, update_params) do
        {:ok, updated} ->
          broadcast_dashboard_update("deal_updated")
          json(conn, %{deal: serialize_deal_simple(updated)})

        {:error, _} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Failed to update deal"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  Send questionnaire to customer.
  Creates a Questionnaire record, sends email with link, advances deal to questionnaire_sent.
  """
  def send_questionnaire(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id) do
      if deal.stage != :meeting_completed do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Deal must be at stage 'meeting_completed'"})
      else
        email = params["customer_email"] || lead.epost

        if email do
          token = Base.url_encode64(:crypto.strong_rand_bytes(32), padding: false)

          case Sales.create_questionnaire(%{
                 deal_id: deal.id,
                 customer_email: email,
                 token: token
               }) do
            {:ok, questionnaire} ->
              send_questionnaire_email(email, lead.företag, token)

              case Sales.advance_deal(deal) do
                {:ok, _advanced} ->
                  broadcast_dashboard_update("questionnaire_sent")

                  json(conn, %{
                    questionnaire: %{
                      id: questionnaire.id,
                      token: questionnaire.token,
                      status: questionnaire.status,
                      customer_email: questionnaire.customer_email
                    }
                  })

                {:error, _reason} ->
                  conn
                  |> put_status(:unprocessable_entity)
                  |> json(%{error: "Could not advance deal"})
              end

            {:error, _} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Could not create questionnaire"})
          end
        else
          conn |> put_status(:unprocessable_entity) |> json(%{error: "No email provided"})
        end
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  Send contract to customer.
  Creates a Contract record, sends email with link + verification code, advances deal to contract_sent.
  """
  def send_contract(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id) do
      if deal.stage != :questionnaire_sent do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Deal must be at stage 'questionnaire_sent'"})
      else
        email = params["recipient_email"] || lead.epost
        name = params["recipient_name"] || lead.företag

        if !email do
          conn |> put_status(:unprocessable_entity) |> json(%{error: "No email provided"})
        else
          if !params["amount"] do
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Amount is required"})
          else
            case Saleflow.Contracts.create_contract(%{
                   deal_id: deal.id,
                   user_id: user.id,
                   recipient_email: email,
                   recipient_name: name,
                   amount: params["amount"],
                   currency: params["currency"] || "SEK",
                   terms: params["terms"],
                   seller_name: user.name
                 }) do
              {:ok, contract} ->
                send_contract_email(email, lead.företag, contract)
                Saleflow.Contracts.mark_sent(contract)

                case Sales.advance_deal(deal) do
                  {:ok, _advanced} ->
                    broadcast_dashboard_update("contract_sent")

                    json(conn, %{
                      contract: %{
                        id: contract.id,
                        contract_number: contract.contract_number,
                        status: :sent,
                        access_token: contract.access_token,
                        verification_code: contract.verification_code,
                        recipient_email: contract.recipient_email,
                        recipient_name: contract.recipient_name,
                        amount: contract.amount,
                        currency: contract.currency
                      }
                    })

                  {:error, _reason} ->
                    conn
                    |> put_status(:unprocessable_entity)
                    |> json(%{error: "Could not advance deal"})
                end

              {:error, _} ->
                conn
                |> put_status(:unprocessable_entity)
                |> json(%{error: "Could not create contract"})
            end
          end
        end
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  # ---------------------------------------------------------------------------
  # Flowing AI proxy actions (admin-only)
  # ---------------------------------------------------------------------------

  def scrape(conn, %{"id" => id, "url" => url}) do
    user = conn.assigns.current_user

    with {:ok, _deal} <- get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <- Saleflow.FlowingAi.scrape(url) do
      json(conn, %{ok: true, data: data})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  def generate(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <-
           Saleflow.FlowingAi.generate(
             params["slug"],
             params["selectedImages"],
             params["selectedServices"]
           ),
         {:ok, _} <- Sales.advance_deal(deal) do
      json(conn, %{ok: true, data: data})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  def deploy(conn, %{"id" => id, "slug" => slug}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <- Saleflow.FlowingAi.deploy(slug),
         url = if(is_map(data), do: data["url"], else: nil),
         {:ok, _} <- Sales.update_deal(deal, %{website_url: url}) do
      json(conn, %{ok: true, url: url})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp get_deal(id) do
    case Sales.get_deal(id) do
      {:ok, deal} -> {:ok, deal}
      {:error, _} -> {:error, :not_found}
    end
  end

  defp enrich_deals(deals) do
    lead_ids = deals |> Enum.map(& &1.lead_id) |> Enum.uniq()
    lead_map = build_lead_map(lead_ids)
    user_names = build_global_user_name_map()

    Enum.map(deals, fn d ->
      lead = Map.get(lead_map, d.lead_id)
      serialize_deal(d, lead, user_names)
    end)
  end

  defp authorize_admin(%{role: :admin}), do: :ok
  defp authorize_admin(_), do: {:error, :forbidden}

  defp send_contract_email(email, company_name, contract) do
    base_url = Application.get_env(:saleflow, :contract_base_url, "https://siteflow.se")
    link = "#{base_url}/contract/#{contract.access_token}"

    body = """
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #0f172a; font-size: 24px; margin-bottom: 8px;">Avtal</h1>
      <p style="color: #64748b; font-size: 14px;">Avtalsnummer: #{contract.contract_number}</p>
    </div>

    <p style="color: #1e293b; font-size: 16px; margin-bottom: 16px;">Hej #{contract.recipient_name},</p>
    <p style="color: #475569; margin-bottom: 24px;">Du har fått ett avtal från Siteflow att granska och signera.</p>

    <div style="background: #f1f5f9; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Din verifieringskod</p>
      <p style="color: #0f172a; font-size: 32px; font-weight: 700; letter-spacing: 4px;">#{contract.verification_code}</p>
    </div>

    <p style="color: #475569; margin-bottom: 24px;">Använd koden ovan för att öppna och granska avtalet via länken nedan:</p>

    #{EmailTemplate.button("Visa avtalet", link)}
    """

    Saleflow.Notifications.Mailer.send_email_async(
      email,
      "Avtal från Siteflow — #{company_name}",
      EmailTemplate.wrap(body)
    )
  end

  defp send_questionnaire_email(email, company_name, token) do
    base_url = Application.get_env(:saleflow, :questionnaire_base_url, "https://siteflow.se")
    link = "#{base_url}/q/#{token}"

    body = """
    <h2>Hej!</h2>
    <p>Vi förbereder din nya hemsida och behöver lite information från dig.</p>
    <p>Fyll i formuläret via länken nedan — det tar bara några minuter:</p>
    #{EmailTemplate.button("Fyll i formuläret", link)}
    <p style="color: #64748b; font-size: 14px;">
      Du kan spara och fortsätta senare — dina svar sparas automatiskt.
    </p>
    """

    Saleflow.Notifications.Mailer.send_email_async(
      email,
      "Fyll i formuläret för din nya hemsida — #{company_name}",
      EmailTemplate.wrap(body)
    )
  end
end
