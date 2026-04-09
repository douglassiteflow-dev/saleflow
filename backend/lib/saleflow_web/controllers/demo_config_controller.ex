defmodule SaleflowWeb.DemoConfigController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  import SaleflowWeb.ControllerHelpers, only: [check_ownership: 2, build_global_user_name_map: 0]
  import SaleflowWeb.Serializers, only: [serialize_lead: 1, serialize_meeting: 2]

  @doc """
  List demo configs.
  Agents see only their own; admins see all.
  Returns configs enriched with lead_name.
  """
  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, configs} =
      case user.role do
        :admin -> Sales.list_demo_configs()
        _ -> Sales.list_demo_configs_for_user(user.id)
      end

    configs = Ash.load!(configs, :lead)
    user_names = build_global_user_name_map()

    json(conn, %{demo_configs: Enum.map(configs, &serialize_simple(&1, user_names))})
  end

  @doc """
  Show a single demo config with lead info, meetings, and questionnaire.
  Agents can only see their own.
  """
  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, user) do
      dc = Ash.load!(dc, [:lead, :meetings])
      user_names = build_global_user_name_map()
      {:ok, meetings} = Sales.list_meetings_for_demo_config(dc.id)
      questionnaire = Sales.latest_questionnaire_for_lead(dc.lead_id)

      json(conn, %{
        demo_config: serialize_detail(dc, user_names),
        lead: serialize_lead(dc.lead),
        meetings: Enum.map(meetings, &serialize_meeting(&1, user_names)),
        questionnaire: serialize_questionnaire(questionnaire)
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  Books a followup meeting, creates Teams meeting, questionnaire, sends email,
  and advances demo config to followup stage.
  """
  def book_followup(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    language = normalize_language(params["language"])

    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, user),
         {:ok, meeting_date} <- parse_date(params["meeting_date"]),
         {:ok, meeting_time} <- parse_time(params["meeting_time"]),
         {:ok, result} <-
           Sales.book_followup(
             dc,
             %{
               meeting_date: meeting_date,
               meeting_time: meeting_time,
               personal_message: params["personal_message"] || "",
               language: language
             },
             user
           ) do
      user_names = build_global_user_name_map()

      json(conn, %{
        demo_config: serialize_simple(result.demo_config, user_names),
        meeting: serialize_meeting(result.meeting, user_names),
        questionnaire: serialize_questionnaire(result.questionnaire)
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, :invalid_stage} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Demo config must be in demo_held stage"})

      {:error, :no_email} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Lead has no email"})

      {:error, :no_microsoft_connection} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "No Microsoft connection"})

      {:error, :invalid_date} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid meeting_date"})

      {:error, :invalid_time} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid meeting_time"})

      {:error, {:teams_failed, _reason}} ->
        conn |> put_status(:bad_gateway) |> json(%{error: "Teams meeting creation failed"})

      {:error, _reason} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not book followup"})
    end
  end

  @doc """
  Returns a rendered email preview (subject + HTML) without sending anything.
  """
  def followup_preview(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    language = normalize_language(params["language"])

    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, user),
         {:ok, lead} <- Sales.get_lead(dc.lead_id) do
      q_base_url = Application.get_env(:saleflow, :questionnaire_base_url, "https://siteflow.se")

      {subject, html} =
        Saleflow.Notifications.FollowupEmail.render(
          %{
            lead_name: lead.vd_namn || lead.företag,
            company_name: lead.företag,
            preview_url: dc.preview_url || "https://demo.siteflow.se",
            questionnaire_url: "#{q_base_url}/q/PREVIEW_TOKEN",
            teams_join_url: "https://teams.microsoft.com/l/meetup-join/PREVIEW",
            meeting_date: params["meeting_date"] || "",
            meeting_time: params["meeting_time"] || "",
            personal_message: params["personal_message"] || "",
            agent_name: user.name || "Siteflow"
          },
          language
        )

      json(conn, %{subject: subject, html: html})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  Advance demo config from demo_ready to followup.
  """
  def advance(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, user),
         {:ok, advanced} <- Sales.advance_to_followup(dc) do
      json(conn, %{demo_config: serialize_simple(advanced)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to advance demo config"})
    end
  end

  @doc """
  Retry generation: reset the config and re-enqueue the worker.
  Only works when stage is :generating (with an error).
  """
  def retry(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, user),
         {:ok, reset_dc} <- Sales.reset_for_retry(dc),
         {:ok, started_dc} <- Sales.start_generation(reset_dc) do
      %{"demo_config_id" => started_dc.id}
      |> Saleflow.Workers.DemoGenerationWorker.new()
      |> Oban.insert()

      json(conn, %{demo_config: serialize_simple(started_dc)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to retry generation"})
    end
  end

  @doc """
  Serve generated HTML file for preview.
  """
  def preview(conn, %{"id" => id}) do
    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, conn.assigns.current_user) do
      if dc.website_path && File.exists?(Path.join(dc.website_path, "index.html")) do
        html_content = File.read!(Path.join(dc.website_path, "index.html"))

        conn
        |> put_resp_content_type("text/html")
        |> send_resp(200, html_content)
      else
        conn |> put_status(:not_found) |> json(%{error: "Preview not available"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  SSE stream of generation progress.
  Subscribes to PubSub topic "demo_generation:\#{id}" and forwards messages
  as Server-Sent Events. Closes on "complete" or "error" status, or after
  15 minutes.
  """
  def logs(conn, %{"id" => id}) do
    with {:ok, dc} <- get_demo_config(id),
         :ok <- check_ownership(dc, conn.assigns.current_user) do
      Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:#{id}")

      conn =
        conn
        |> put_resp_content_type("text/event-stream")
        |> put_resp_header("cache-control", "no-cache")
        |> put_resp_header("connection", "keep-alive")
        |> send_chunked(200)

      stream_loop(conn, id)
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "DemoConfig not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  # ---------------------------------------------------------------------------
  # SSE helpers
  # ---------------------------------------------------------------------------

  @default_sse_timeout_ms 15 * 60 * 1_000

  defp sse_timeout_ms do
    Application.get_env(:saleflow, :sse_timeout_ms, @default_sse_timeout_ms)
  end

  @doc false
  def stream_loop(conn, id) do
    receive do
      {:demo_generation, %{status: status} = payload} ->
        data = Jason.encode!(payload)

        case chunk(conn, "event: message\ndata: #{data}\n\n") do
          {:ok, conn} ->
            if status in ["complete", "error"] do
              Phoenix.PubSub.unsubscribe(Saleflow.PubSub, "demo_generation:#{id}")
              conn
            else
              stream_loop(conn, id)
            end

          {:error, _reason} ->
            Phoenix.PubSub.unsubscribe(Saleflow.PubSub, "demo_generation:#{id}")
            conn
        end
    after
      sse_timeout_ms() ->
        chunk(conn, "event: timeout\ndata: {}\n\n")
        Phoenix.PubSub.unsubscribe(Saleflow.PubSub, "demo_generation:#{id}")
        conn
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp get_demo_config(id) do
    case Sales.get_demo_config(id) do
      {:ok, dc} -> {:ok, dc}
      {:error, _} -> {:error, :not_found}
    end
  end

  defp serialize_simple(dc, user_names \\ %{}) do
    lead_name =
      cond do
        is_struct(dc.lead, Saleflow.Sales.Lead) -> dc.lead.företag
        true -> nil
      end

    %{
      id: dc.id,
      lead_id: dc.lead_id,
      user_id: dc.user_id,
      user_name: Map.get(user_names, dc.user_id),
      stage: dc.stage,
      source_url: dc.source_url,
      website_path: dc.website_path,
      preview_url: dc.preview_url,
      notes: dc.notes,
      error: dc.error,
      health_score: dc.health_score,
      lead_name: lead_name,
      inserted_at: dc.inserted_at,
      updated_at: dc.updated_at
    }
  end

  defp serialize_detail(dc, user_names) do
    serialize_simple(dc, user_names)
  end

  defp serialize_questionnaire(nil), do: nil

  defp serialize_questionnaire(q) do
    %{
      id: q.id,
      token: q.token,
      status: q.status,
      customer_email: q.customer_email,
      lead_id: q.lead_id,
      deal_id: q.deal_id,
      opened_at: q.opened_at,
      started_at: q.started_at,
      completed_at: q.completed_at,
      inserted_at: q.inserted_at,
      updated_at: q.updated_at
    }
  end

  defp normalize_language("en"), do: "en"
  defp normalize_language(_), do: "sv"

  defp parse_date(nil), do: {:error, :invalid_date}

  defp parse_date(str) when is_binary(str) do
    case Date.from_iso8601(str) do
      {:ok, date} -> {:ok, date}
      _ -> {:error, :invalid_date}
    end
  end

  defp parse_date(_), do: {:error, :invalid_date}

  defp parse_time(nil), do: {:error, :invalid_time}

  defp parse_time(str) when is_binary(str) do
    with_seconds = if String.length(str) == 5, do: str <> ":00", else: str

    case Time.from_iso8601(with_seconds) do
      {:ok, time} -> {:ok, time}
      _ -> {:error, :invalid_time}
    end
  end

  defp parse_time(_), do: {:error, :invalid_time}
end
