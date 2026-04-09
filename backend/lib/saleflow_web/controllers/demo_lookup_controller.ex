defmodule SaleflowWeb.DemoLookupController do
  @moduledoc """
  Public lookup endpoint for demo URLs by slug.
  Used by the demo.siteflow.se router app to proxy requests to the
  actual Vercel deployment URL.
  """
  use SaleflowWeb, :controller

  require Ash.Query

  def show(conn, %{"slug" => slug}) do
    # First try generation_jobs (has slug field)
    case find_by_generation_job(slug) do
      {:ok, url} ->
        json(conn, %{slug: slug, url: url})

      :not_found ->
        # Fall back to demo_configs via preview_url pattern
        case find_by_demo_config(slug) do
          {:ok, url} ->
            json(conn, %{slug: slug, url: url})

          :not_found ->
            conn
            |> put_status(:not_found)
            |> json(%{error: "Demo hittades inte"})
        end
    end
  end

  defp find_by_generation_job(slug) do
    Saleflow.Generation.GenerationJob
    |> Ash.Query.filter(slug == ^slug and status == :completed)
    |> Ash.Query.sort(completed_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [%{result_url: url} | _]} when is_binary(url) and url != "" -> {:ok, url}
      _ -> :not_found
    end
  end

  defp find_by_demo_config(slug) do
    # Match by source_url containing the slug
    Saleflow.Sales.DemoConfig
    |> Ash.Query.filter(stage == :demo_ready or stage == :followup)
    |> Ash.Query.sort(updated_at: :desc)
    |> Ash.read()
    |> case do
      {:ok, configs} ->
        configs
        |> Enum.find(fn c ->
          c.preview_url && String.contains?(c.preview_url, slug)
        end)
        |> case do
          nil -> :not_found
          config -> {:ok, config.preview_url}
        end

      _ ->
        :not_found
    end
  end
end
