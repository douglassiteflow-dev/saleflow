defmodule Saleflow.FlowingAi do
  @moduledoc """
  HTTP client for the Flowing AI website generator API.
  """

  def base_url do
    Application.get_env(:saleflow, :flowing_ai_url, "http://localhost:1337")
  end

  def scrape(bokadirekt_url) do
    body = Jason.encode!(%{url: bokadirekt_url})

    case Req.post("#{base_url()}/api/scrape",
           body: body,
           headers: [{"content-type", "application/json"}]
         ) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  def generate(slug, selected_images, selected_services, customer_id \\ nil) do
    body =
      Jason.encode!(%{
        slug: slug,
        selectedImages: selected_images,
        selectedServices: selected_services,
        customerId: customer_id
      })

    case Req.post("#{base_url()}/api/generate",
           body: body,
           headers: [{"content-type", "application/json"}]
         ) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  def deploy(slug) do
    case Req.post("#{base_url()}/api/deploy/#{slug}",
           body: "",
           headers: [{"content-type", "application/json"}]
         ) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  def logs_url(slug), do: "#{base_url()}/api/generate/#{slug}/logs"
  def status_url(slug), do: "#{base_url()}/api/generate/#{slug}/status"
end
