defmodule SaleflowWeb.DealController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Accounts
  alias Saleflow.Audit

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
      unless deal.stage == :meeting_completed do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Deal måste vara i steget 'Möte genomfört'"})
      else
        email = params["customer_email"] || lead.epost

        unless email do
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Ingen email angiven"})
        else
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
                  |> json(%{error: "Kunde inte avancera deal"})
              end

            {:error, _} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{error: "Kunde inte skapa formulär"})
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

  @doc """
  Send contract to customer.
  Creates a Contract record, sends email with link + verification code, advances deal to contract_sent.
  """
  def send_contract(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id) do
      unless deal.stage == :questionnaire_sent do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Deal måste vara i steget 'Formulär skickat'"})
      else
        email = params["recipient_email"] || lead.epost
        name = params["recipient_name"] || lead.företag

        unless email do
          conn |> put_status(:unprocessable_entity) |> json(%{error: "Ingen email angiven"})
        else
          unless params["amount"] do
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Belopp krävs"})
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
                    |> json(%{error: "Kunde inte avancera deal"})
                end

              {:error, _} ->
                conn
                |> put_status(:unprocessable_entity)
                |> json(%{error: "Kunde inte skapa avtal"})
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

  defp check_ownership(_deal, %{role: :admin}), do: :ok

  defp check_ownership(deal, user) do
    if deal.user_id == user.id do
      :ok
    else
      {:error, :forbidden}
    end
  end

  defp enrich_deals(deals) do
    lead_ids = deals |> Enum.map(& &1.lead_id) |> Enum.uniq()

    lead_map =
      Enum.reduce(lead_ids, %{}, fn lid, acc ->
        case Sales.get_lead(lid) do
          {:ok, lead} -> Map.put(acc, lid, lead)
          _ -> acc
        end
      end)

    user_names = build_global_user_name_map()

    Enum.map(deals, fn d ->
      lead = Map.get(lead_map, d.lead_id)
      serialize_deal(d, lead, user_names)
    end)
  end

  defp build_global_user_name_map do
    case Accounts.list_users() do
      {:ok, users} -> Enum.into(users, %{}, fn u -> {u.id, u.name} end)
      _ -> %{}
    end
  end

  defp serialize_deal_simple(deal) do
    %{
      id: deal.id,
      lead_id: deal.lead_id,
      user_id: deal.user_id,
      stage: deal.stage,
      notes: deal.notes,
      website_url: deal.website_url,
      meeting_outcome: deal.meeting_outcome,
      needs_followup: deal.needs_followup,
      domain: deal.domain,
      domain_sponsored: deal.domain_sponsored,
      inserted_at: deal.inserted_at,
      updated_at: deal.updated_at
    }
  end

  defp serialize_deal(deal, nil, user_names) do
    serialize_deal_simple(deal)
    |> Map.put(:lead_name, nil)
    |> Map.put(:user_name, Map.get(user_names, deal.user_id))
  end

  defp serialize_deal(deal, lead, user_names) do
    serialize_deal_simple(deal)
    |> Map.put(:lead_name, lead.företag)
    |> Map.put(:user_name, Map.get(user_names, deal.user_id))
  end

  defp serialize_lead(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      telefon_2: lead.telefon_2,
      epost: lead.epost,
      hemsida: lead.hemsida,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      orgnr: lead.orgnr,
      omsättning_tkr: lead.omsättning_tkr,
      vinst_tkr: lead.vinst_tkr,
      anställda: lead.anställda,
      vd_namn: lead.vd_namn,
      bolagsform: lead.bolagsform,
      status: lead.status,
      quarantine_until: lead.quarantine_until,
      callback_at: lead.callback_at,
      källa: lead.källa,
      lead_list_id: lead.lead_list_id,
      imported_at: lead.imported_at,
      inserted_at: lead.inserted_at,
      updated_at: lead.updated_at
    }
  end

  defp serialize_meeting(meeting, user_names) do
    %{
      id: meeting.id,
      lead_id: meeting.lead_id,
      user_id: meeting.user_id,
      user_name: Map.get(user_names, meeting.user_id),
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      meeting_time: meeting.meeting_time,
      notes: meeting.notes,
      duration_minutes: meeting.duration_minutes,
      status: meeting.status,
      deal_id: meeting.deal_id,
      inserted_at: meeting.inserted_at,
      updated_at: meeting.updated_at
    }
  end

  defp serialize_audit_log(log, user_names) do
    %{
      id: log.id,
      user_id: log.user_id,
      user_name: Map.get(user_names, log.user_id),
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      changes: log.changes,
      metadata: log.metadata,
      inserted_at: log.inserted_at
    }
  end

  defp broadcast_dashboard_update(event) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "dashboard:updates",
      {:dashboard_update, %{event: event}}
    )
  end

  defp authorize_admin(%{role: :admin}), do: :ok
  defp authorize_admin(_), do: {:error, :forbidden}

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp send_contract_email(email, company_name, contract) do
    base_url = Application.get_env(:saleflow, :contract_base_url, "https://siteflow.se")
    link = "#{base_url}/contract/#{contract.access_token}"

    html = """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
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

      <p style="text-align: center; margin: 24px 0;">
        <a href="#{link}" style="background: #0f172a; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
          Visa avtalet
        </a>
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">Med vänliga hälsningar,<br>Siteflow</p>
    </div>
    """

    Saleflow.Notifications.Mailer.send_email_async(
      email,
      "Avtal från Siteflow — #{company_name}",
      html
    )
  end

  defp send_questionnaire_email(email, company_name, token) do
    base_url = Application.get_env(:saleflow, :questionnaire_base_url, "https://siteflow.se")
    link = "#{base_url}/q/#{token}"

    html = """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Hej!</h2>
      <p>Vi förbereder din nya hemsida och behöver lite information från dig.</p>
      <p>Fyll i formuläret via länken nedan — det tar bara några minuter:</p>
      <p style="margin: 24px 0;">
        <a href="#{link}" style="background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Fyll i formuläret
        </a>
      </p>
      <p style="color: #64748b; font-size: 14px;">
        Du kan spara och fortsätta senare — dina svar sparas automatiskt.
      </p>
      <p style="color: #64748b; font-size: 14px;">Med vänliga hälsningar,<br>Siteflow</p>
    </div>
    """

    Saleflow.Notifications.Mailer.send_email_async(
      email,
      "Fyll i formuläret för din nya hemsida — #{company_name}",
      html
    )
  end
end
