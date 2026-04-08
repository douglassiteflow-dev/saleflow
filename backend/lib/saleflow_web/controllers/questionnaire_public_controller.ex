defmodule SaleflowWeb.QuestionnairePublicController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  @doc "GET /q/:token — fetch questionnaire data and questions"
  def show(conn, %{"token" => token}) do
    case Sales.get_questionnaire_by_token(token) do
      {:ok, q} ->
        json(conn, %{questionnaire: serialize(q)})

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

  @doc "POST /q/:token/upload — upload media file, return URL"
  def upload(conn, %{"token" => token, "file" => %Plug.Upload{} = upload}) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token) do
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

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

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
