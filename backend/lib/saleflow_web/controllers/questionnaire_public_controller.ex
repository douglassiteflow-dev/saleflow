defmodule SaleflowWeb.QuestionnairePublicController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  import SaleflowWeb.ControllerHelpers, only: [maybe_put: 3]

  @doc "GET /q/:token — fetch questionnaire data and questions. Tracks first visit."
  def show(conn, %{"token" => token}) do
    case Sales.get_questionnaire_by_token(token) do
      {:ok, q} ->
        # Track first visit — sets opened_at if nil
        {:ok, updated} = Sales.mark_questionnaire_opened(q)
        json(conn, %{questionnaire: serialize(updated)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})
    end
  end

  @doc "PATCH /q/:token — autosave answers"
  def save(conn, %{"token" => token} = params) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token),
         {:ok, updated} <- Sales.save_questionnaire_answers(q, parse_answers(params)) do
      json(conn, %{questionnaire: serialize(updated)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Kunde inte spara"})
    end
  end

  @doc "POST /q/:token/complete — mark as completed, notify deal owner"
  def complete(conn, %{"token" => token}) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token),
         {:ok, completed} <- Sales.complete_questionnaire(q) do
      # Notify deal owner
      maybe_notify_deal_owner(completed)
      json(conn, %{questionnaire: serialize(completed)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Kunde inte slutföra"})
    end
  end

  @allowed_upload_types ~w(image/jpeg image/png image/gif image/webp video/mp4 video/quicktime application/pdf application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
  @max_upload_size 50 * 1024 * 1024

  @doc "POST /q/:token/upload — upload media file, return URL"
  def upload(conn, %{"token" => token, "file" => %Plug.Upload{} = upload}) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token),
         :ok <- validate_content_type(upload.content_type),
         :ok <- validate_file_size(upload.path) do
      key = "questionnaires/#{q.id}/#{Ecto.UUID.generate()}-#{upload.filename}"
      data = File.read!(upload.path)

      case Saleflow.Storage.upload(key, data, upload.content_type) do
        {:ok, _} ->
          {:ok, url} = Saleflow.Storage.presigned_url(key)
          # Append to media_urls
          new_urls = (q.media_urls || []) ++ [url]
          {:ok, _} = Sales.save_questionnaire_answers(q, %{media_urls: new_urls})
          json(conn, %{url: url})

        {:error, reason} ->
          conn
          |> put_status(500)
          |> json(%{error: "Uppladdning misslyckades: #{inspect(reason)}"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})

      {:error, :unsupported_media_type} ->
        conn |> put_status(:unsupported_media_type) |> json(%{error: "Filtypen stöds inte"})

      {:error, :request_entity_too_large} ->
        conn |> put_status(:request_entity_too_large) |> json(%{error: "Filen är för stor (max 50 MB)"})
    end
  end

  def upload(conn, %{"token" => _token}) do
    conn |> put_status(:bad_request) |> json(%{error: "Ingen fil bifogad"})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize(q) do
    %{
      id: q.id,
      deal_id: q.deal_id,
      lead_id: q.lead_id,
      token: q.token,
      status: q.status,
      customer_email: q.customer_email,
      capacity: q.capacity,
      color_theme: q.color_theme,
      services_text: q.services_text,
      services_file_url: q.services_file_url,
      custom_changes: q.custom_changes,
      wants_ads: q.wants_ads,
      most_profitable_service: q.most_profitable_service,
      wants_quote_generator: q.wants_quote_generator,
      addon_services: q.addon_services,
      media_urls: q.media_urls,
      opened_at: q.opened_at,
      started_at: q.started_at,
      completed_at: q.completed_at,
      inserted_at: q.inserted_at,
      updated_at: q.updated_at
    }
  end

  defp parse_answers(params) do
    %{}
    |> maybe_put(:capacity, params["capacity"])
    |> maybe_put(:color_theme, params["color_theme"])
    |> maybe_put(:services_text, params["services_text"])
    |> maybe_put(:services_file_url, params["services_file_url"])
    |> maybe_put(:custom_changes, params["custom_changes"])
    |> maybe_put(:wants_ads, params["wants_ads"])
    |> maybe_put(:most_profitable_service, params["most_profitable_service"])
    |> maybe_put(:wants_quote_generator, params["wants_quote_generator"])
    |> maybe_put(:addon_services, params["addon_services"])
    |> maybe_put(:media_urls, params["media_urls"])
  end

  defp validate_content_type(content_type) do
    if content_type in @allowed_upload_types, do: :ok, else: {:error, :unsupported_media_type}
  end

  defp validate_file_size(path) do
    if File.stat!(path).size <= @max_upload_size, do: :ok, else: {:error, :request_entity_too_large}
  end

  defp maybe_notify_deal_owner(questionnaire) do
    if questionnaire.deal_id do
      case Sales.get_deal(questionnaire.deal_id) do
        {:ok, deal} ->
          Saleflow.Notifications.Notify.send(%{
            user_id: deal.user_id,
            type: "questionnaire_completed",
            title: "Formulär ifyllt",
            body: "Kunden har fyllt i formuläret",
            resource_type: "Deal",
            resource_id: deal.id
          })

        _ ->
          :ok
      end
    end
  end
end
