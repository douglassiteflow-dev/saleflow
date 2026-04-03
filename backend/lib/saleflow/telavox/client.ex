defmodule Saleflow.Telavox.Client do
  @moduledoc """
  HTTP client for the Telavox API.

  Two auth modes:
  - Shared token (env var) for read-only: polling extensions, fetching recordings
  - Per-agent token for write operations: dial, hangup
  """

  @behaviour Saleflow.Telavox.ClientBehaviour

  @base_url "https://api.telavox.se"

  @impl true
  @doc "GET request using shared org token."
  def get(path) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")
    request(:get, path, token)
  end

  @impl true
  @doc "GET request using a specific agent token."
  def get_as(token, path) do
    request(:get, path, token)
  end

  @impl true
  @doc "POST request using a specific agent token."
  def post_as(token, path) do
    request(:post, path, token)
  end

  @doc "GET request that returns raw binary body (for MP3 downloads)."
  def get_binary(path) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")
    url = @base_url <> path

    case Req.get(url, headers: [{"authorization", "Bearer #{token}"}], decode_body: false) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: status}} -> {:error, {:http, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp request(method, path, token) do
    url = @base_url <> path
    opts = [headers: [{"authorization", "Bearer #{token}"}]]

    result =
      case method do
        :get -> Req.get(url, opts)
        :post -> Req.post(url, opts)
      end

    case result do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: 400, body: body}} -> {:error, {:bad_request, body}}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end
end
